// Always-on TRIGGER campaigns.
// Owner creates the rule once (message + channel + on/off); it fires per customer automatically.
// Each trigger fires only ONCE per customer per cycle (trigger_fires dedupe).
// - near_reward / reward_earned: evaluated right after a visit is awarded (event-driven)
// - lapsed_30 / birthday: evaluated by the daily cron (time-driven)

import { createServiceSupabase } from "./supabase";
import { sendMarketingMessage } from "./campaigns";
import { getProgress } from "./loyalty";

type TriggerType = "near_reward" | "lapsed_30" | "birthday" | "reward_earned";

async function issuedRewardCount(tenantId: string, customerId: string): Promise<number> {
  const svc = createServiceSupabase();
  const { count } = await svc.from("ledger_events").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("customer_id", customerId).eq("type", "REWARD_ISSUED");
  return count ?? 0;
}

async function fireRule(rule: any, customerId: string, cycleKey: string) {
  return sendMarketingMessage({
    tenantId: rule.tenant_id,
    customerId,
    channel: rule.channel,
    body: rule.message_template,
    triggerRuleId: rule.id,
    cycleKey,
  });
}

async function activeRules(tenantId: string, type: TriggerType) {
  const svc = createServiceSupabase();
  const { data } = await svc.from("trigger_rules").select("*")
    .eq("tenant_id", tenantId).eq("trigger_type", type).eq("enabled", true);
  return data ?? [];
}

/** Called after awardVisit / redeemReward for event-driven triggers. */
export async function evaluateEventTriggers(tenantId: string, customerId: string, event: "award" | "reward", rewardLabel?: string) {
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("id", tenantId).single();
  if (!tenant || tenant.marketing_paused) return;

  if (event === "award") {
    const prog = await getProgress(tenantId, customerId);
    const rules = await activeRules(tenantId, "near_reward");
    if (!rules.length) return;
    const within = 1; // fire when 1 stamp / 10 points away
    const near = tenant.reward_mode === "visits"
      ? prog.stamps >= tenant.stamp_threshold - within && prog.stamps < tenant.stamp_threshold
      : prog.points >= tenant.points_threshold - 10 && prog.points < tenant.points_threshold;
    if (near) {
      const cycleKey = `nr_${await issuedRewardCount(tenantId, customerId)}`;
      for (const rule of rules) await fireRule(rule, customerId, cycleKey);
    }
  }

  if (event === "reward") {
    const rules = await activeRules(tenantId, "reward_earned");
    const { data: latest } = await svc.from("rewards").select("id").eq("customer_id", customerId)
      .order("issued_at", { ascending: false }).limit(1).single();
    for (const rule of rules) {
      await fireRule({ ...rule, message_template: rule.message_template.replaceAll("{{reward}}", rewardLabel ?? tenant.reward_label) }, customerId, `rw_${latest?.id ?? "na"}`);
    }
  }
}

/** Daily cron: lapsed_30 win-back + birthday. Safe to re-run (dedupe by cycle key). */
export async function runDailyTriggers() {
  const svc = createServiceSupabase();
  const { data: tenants } = await svc.from("tenants").select("id, marketing_paused, status").eq("status", "active");
  const today = new Date();
  const monthKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const yearKey = `${today.getUTCFullYear()}`;
  const lapsedCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  let fired = 0;

  for (const t of tenants ?? []) {
    if (t.marketing_paused) continue;

    // Win-back: customers with no activity in 30 days
    for (const rule of await activeRules(t.id, "lapsed_30")) {
      const { data: progs } = await svc.from("customer_programs")
        .select("customer_id, updated_at").eq("tenant_id", t.id).lt("updated_at", lapsedCutoff);
      for (const p of progs ?? []) {
        const r = await fireRule(rule, p.customer_id, `lapsed_${monthKey}`);
        if (r.ok) fired++;
      }
    }

    // Birthday: customers with birthday today
    for (const rule of await activeRules(t.id, "birthday")) {
      const { data: customers } = await svc.from("customers").select("id, birthday").eq("tenant_id", t.id);
      const todays = (customers ?? []).filter((c) => {
        if (!c.birthday) return false;
        const b = new Date(c.birthday);
        return b.getUTCMonth() === today.getUTCMonth() && b.getUTCDate() === today.getUTCDate();
      });
      for (const c of todays) {
        const r = await fireRule(rule, c.id, `bday_${yearKey}`);
        if (r.ok) fired++;
      }
    }
  }
  return { fired };
}
