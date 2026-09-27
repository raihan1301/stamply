"use server";
import { revalidatePath } from "next/cache";
import { createServiceSupabase } from "@/lib/supabase";
import { requireUser, membershipFor } from "@/lib/auth";
import { sendBroadcast, getUsage } from "@/lib/campaigns";

const TRIGGER_TYPES = ["near_reward", "lapsed_30", "birthday", "reward_earned"] as const;

async function requireManager(slug: string) {
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner", "manager"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  return { u, tenant };
}

export async function saveTriggerRule(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { u, tenant } = await requireManager(slug);
  const svc = createServiceSupabase();
  const trigger_type = String(formData.get("trigger_type"));
  const channel = String(formData.get("channel"));
  if (!TRIGGER_TYPES.includes(trigger_type as any)) throw new Error("Bad trigger.");
  if (!["sms", "email"].includes(channel)) throw new Error("Bad channel.");
  const message_template = String(formData.get("message_template") ?? "").trim();
  if (!message_template) throw new Error("Message is required.");
  const id = String(formData.get("id") ?? "");
  const row = {
    tenant_id: tenant.id, trigger_type, channel, message_template,
    enabled: formData.get("enabled") === "on",
    created_by: u.id, updated_at: new Date().toISOString(),
  };
  if (id) await svc.from("trigger_rules").update(row).eq("id", id).eq("tenant_id", tenant.id);
  else await svc.from("trigger_rules").insert(row);
  await svc.from("audit_events").insert({
    tenant_id: tenant.id, actor_user_id: u.id, action: "TRIGGER_RULE_SAVED",
    target_type: "trigger_rule", target_id: id || "new", reason: `${trigger_type}/${channel}`,
  });
  revalidatePath(`/o/${slug}/campaigns`);
}

export async function deleteTriggerRule(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { tenant } = await requireManager(slug);
  const svc = createServiceSupabase();
  await svc.from("trigger_rules").delete().eq("id", String(formData.get("id"))).eq("tenant_id", tenant.id);
  revalidatePath(`/o/${slug}/campaigns`);
}

export async function createCampaign(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { u, tenant } = await requireManager(slug);
  const svc = createServiceSupabase();
  const channel = String(formData.get("channel"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Message is required.");
  if (channel === "sms" && body.length > 320) throw new Error("Keep SMS under 320 characters (2 segments).");
  const { data, error } = await svc.from("campaigns").insert({
    tenant_id: tenant.id,
    name: String(formData.get("name") ?? "Campaign").slice(0, 80),
    channel, audience: String(formData.get("audience") ?? "all"),
    subject: String(formData.get("subject") ?? "").slice(0, 120) || null,
    body, status: "draft", created_by: u.id,
  }).select("id").single();
  if (error) throw new Error("Could not create campaign.");
  revalidatePath(`/o/${slug}/campaigns`);
}

export async function sendCampaign(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { u, tenant } = await requireManager(slug);
  if (tenant.marketing_paused) throw new Error("Marketing is paused for this business.");
  const usage = await getUsage(tenant.id);
  await sendBroadcast(String(formData.get("campaign_id")), u.id);
  revalidatePath(`/o/${slug}/campaigns`);
}
