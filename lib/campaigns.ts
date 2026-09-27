// Campaign + trigger engine with guardrails:
// - CASL consent: only customers whose LATEST consent record for the channel is opted_in
// - Monthly limits: every SMS/email counts against tenant.sms_limit / email_limit
// - Frequency cap: max 1 marketing SMS per customer per 7 days
// - Kill switches: marketing_paused / sms_paused on the tenant
// - Trigger dedupe: trigger_fires unique (rule, customer, cycle_key)

import { createServiceSupabase } from "./supabase";
import { sendSms, sendEmail, isSimulator } from "./messaging";

export type Channel = "sms" | "email";

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(tenantId: string) {
  const svc = createServiceSupabase();
  const month = currentMonth();
  const { data: tenant } = await svc.from("tenants").select("sms_limit, email_limit").eq("id", tenantId).single();
  let { data: counter } = await svc.from("usage_counters").select("*").eq("tenant_id", tenantId).eq("month", month).single();
  if (!counter) {
    const { data } = await svc.from("usage_counters").insert({ tenant_id: tenantId, month, sms_used: 0, email_used: 0 }).select().single();
    counter = data;
  }
  return {
    month,
    smsLimit: tenant?.sms_limit ?? 300,
    emailLimit: tenant?.email_limit ?? 5000,
    smsUsed: counter?.sms_used ?? 0,
    emailUsed: counter?.email_used ?? 0,
    smsLeft: (tenant?.sms_limit ?? 300) - (counter?.sms_used ?? 0),
    emailLeft: (tenant?.email_limit ?? 5000) - (counter?.email_used ?? 0),
  };
}

async function bumpUsage(tenantId: string, channel: Channel) {
  const svc = createServiceSupabase();
  const month = currentMonth();
  const field = channel === "sms" ? "sms_used" : "email_used";
  const { data } = await svc.from("usage_counters").select("*").eq("tenant_id", tenantId).eq("month", month).single();
  if (data) {
    await svc.from("usage_counters").update({ [field]: (data[field] ?? 0) + 1 }).eq("tenant_id", tenantId).eq("month", month);
  }
}

/** CASL: is this customer currently opted in on this channel? */
export async function hasConsent(tenantId: string, customerId: string, channel: Channel): Promise<boolean> {
  const svc = createServiceSupabase();
  const { data } = await svc.from("consent_events").select("status")
    .eq("tenant_id", tenantId).eq("customer_id", customerId).eq("channel", channel)
    .order("created_at", { ascending: false }).limit(1).single();
  return data?.status === "opted_in";
}

/** Frequency cap: marketing SMS at most once per customer per 7 days. */
export async function withinFrequencyCap(tenantId: string, customerId: string, channel: Channel): Promise<boolean> {
  if (channel !== "sms") return true;
  const svc = createServiceSupabase();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count } = await svc.from("messages").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("customer_id", customerId).eq("channel", "sms")
    .eq("status", "sent").gte("created_at", weekAgo);
  return (count ?? 0) < 1;
}

export interface SendResult { sent: number; suppressed: number; skippedNoConsent: number; skippedCap: number; }

/**
 * Send one marketing message to one customer, enforcing every guardrail.
 * Returns why it did not send when suppressed.
 */
export async function sendMarketingMessage(opts: {
  tenantId: string;
  customerId: string;
  channel: Channel;
  subject?: string;
  body: string;
  campaignId?: string | null;
  triggerRuleId?: string | null;
  cycleKey?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("id", opts.tenantId).single();
  if (!tenant) return { ok: false, reason: "Business not found" };
  if (tenant.status === "suspended") return { ok: false, reason: "Business paused" };
  if (tenant.marketing_paused) return { ok: false, reason: "Marketing paused for this business" };
  if (opts.channel === "sms" && tenant.sms_paused) return { ok: false, reason: "SMS paused for this business" };

  // Trigger dedupe: once per customer per cycle
  if (opts.triggerRuleId && opts.cycleKey) {
    const { data: fired } = await svc.from("trigger_fires").select("id")
      .eq("trigger_rule_id", opts.triggerRuleId).eq("customer_id", opts.customerId).eq("cycle_key", opts.cycleKey).single();
    if (fired) return { ok: false, reason: "Already sent for this cycle" };
  }

  // CASL consent
  if (!(await hasConsent(opts.tenantId, opts.customerId, opts.channel))) {
    await svc.from("messages").insert({
      tenant_id: opts.tenantId, campaign_id: opts.campaignId ?? null, customer_id: opts.customerId,
      channel: opts.channel, status: "suppressed", simulated: isSimulator(), error: "No valid consent",
    });
    return { ok: false, reason: "No consent" };
  }

  // Frequency cap
  if (!(await withinFrequencyCap(opts.tenantId, opts.customerId, opts.channel))) {
    return { ok: false, reason: "Frequency cap (1 SMS/week)" };
  }

  // Monthly limit
  const usage = await getUsage(opts.tenantId);
  const left = opts.channel === "sms" ? usage.smsLeft : usage.emailLeft;
  if (left <= 0) return { ok: false, reason: `Monthly ${opts.channel.toUpperCase()} limit reached` };

  // Recipient address
  const { data: customer } = await svc.from("customers").select("phone, email, name").eq("id", opts.customerId).single();
  const to = opts.channel === "sms" ? customer?.phone : customer?.email;
  if (!to) return { ok: false, reason: `No ${opts.channel} address` };

  // Personalize + append unsubscribe
  const name = customer?.name?.split(" ")[0] ?? "friend";
  let body = opts.body.replaceAll("{{name}}", name).replaceAll("{{business}}", tenant.name);
  body += opts.channel === "sms"
    ? `\n\nReply STOP to opt out. ${tenant.name}`
    : `\n\n—\n${tenant.name} · Don't want these emails? Reply "unsubscribe" and we'll remove you within 10 days.`;

  try {
    const res = opts.channel === "sms"
      ? await sendSms(to, body)
      : await sendEmail(to, opts.subject ?? `News from ${tenant.name}`, body);
    const { data: msg } = await svc.from("messages").insert({
      tenant_id: opts.tenantId, campaign_id: opts.campaignId ?? null, customer_id: opts.customerId,
      channel: opts.channel, status: "sent", provider_message_id: res.providerId, simulated: isSimulator(),
    }).select("id").single();
    await bumpUsage(opts.tenantId, opts.channel);
    if (opts.triggerRuleId && opts.cycleKey && msg) {
      await svc.from("trigger_fires").insert({
        tenant_id: opts.tenantId, trigger_rule_id: opts.triggerRuleId,
        customer_id: opts.customerId, cycle_key: opts.cycleKey, message_id: msg.id,
      });
    }
    return { ok: true };
  } catch (e: any) {
    await svc.from("messages").insert({
      tenant_id: opts.tenantId, campaign_id: opts.campaignId ?? null, customer_id: opts.customerId,
      channel: opts.channel, status: "failed", simulated: isSimulator(), error: String(e?.message ?? e),
    });
    return { ok: false, reason: "Send failed" };
  }
}

export type Audience = "all" | "near_reward" | "lapsed_30" | "birthday_month";

/** Resolve a broadcast audience to customer ids (consent is still checked per message). */
export async function resolveAudience(tenantId: string, audience: Audience): Promise<string[]> {
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("id", tenantId).single();
  if (!tenant) return [];
  const { data: customers } = await svc.from("customers").select("id, birthday").eq("tenant_id", tenantId);
  if (!customers) return [];
  if (audience === "all") return customers.map((c) => c.id);

  const { data: progs } = await svc.from("customer_programs").select("customer_id, stamps, points, updated_at").eq("tenant_id", tenantId);
  const progById = new Map((progs ?? []).map((p) => [p.customer_id, p]));

  if (audience === "near_reward") {
    return customers.filter((c) => {
      const p = progById.get(c.id);
      if (!p) return false;
      if (tenant.reward_mode === "visits") {
        const within = (tenant as any).near_within ?? 1;
        return p.stamps >= tenant.stamp_threshold - within && p.stamps < tenant.stamp_threshold;
      }
      const within = (tenant as any).near_within ?? 10;
      return p.points >= tenant.points_threshold - within && p.points < tenant.points_threshold;
    }).map((c) => c.id);
  }
  if (audience === "lapsed_30") {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    return customers.filter((c) => {
      const p = progById.get(c.id);
      return p ? p.updated_at < cutoff : true;
    }).map((c) => c.id);
  }
  if (audience === "birthday_month") {
    const m = new Date().getUTCMonth() + 1;
    return customers.filter((c) => c.birthday && new Date(c.birthday).getUTCMonth() + 1 === m).map((c) => c.id);
  }
  return [];
}

/** Send a one-time broadcast campaign now. */
export async function sendBroadcast(campaignId: string, actorUserId: string): Promise<SendResult> {
  const svc = createServiceSupabase();
  const { data: camp } = await svc.from("campaigns").select("*").eq("id", campaignId).single();
  if (!camp || camp.status !== "draft") throw new Error("Campaign is not ready to send.");
  await svc.from("campaigns").update({ status: "sending" }).eq("id", campaignId);

  const audience = await resolveAudience(camp.tenant_id, camp.audience as Audience);
  const result: SendResult = { sent: 0, suppressed: 0, skippedNoConsent: 0, skippedCap: 0 };
  for (const customerId of audience) {
    const r = await sendMarketingMessage({
      tenantId: camp.tenant_id, customerId, channel: camp.channel,
      subject: camp.subject ?? undefined, body: camp.body, campaignId,
    });
    if (r.ok) result.sent++;
    else if (r.reason === "No consent") { result.suppressed++; result.skippedNoConsent++; }
    else if (r.reason?.includes("Frequency cap")) { result.suppressed++; result.skippedCap++; }
    else result.suppressed++;
  }
  await svc.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaignId);
  await svc.from("audit_events").insert({
    tenant_id: camp.tenant_id, actor_user_id: actorUserId, action: "CAMPAIGN_SENT",
    target_type: "campaign", target_id: campaignId, reason: `${result.sent} sent, ${result.suppressed} suppressed`,
  });
  return result;
}
