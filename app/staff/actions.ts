"use server";
import { requireUser, membershipFor } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { awardVisit, redeemReward, getProgress } from "@/lib/loyalty";
import { evaluateEventTriggers } from "@/lib/triggers";

async function staffTenant(slug: string) {
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner", "manager", "staff"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  return { u, m, tenant };
}

export async function awardVisitAction(slug: string, customerId: string, amountDollars: number, idempotencyKey: string) {
  const { u, m, tenant } = await staffTenant(slug);
  const r = await awardVisit({
    tenantId: tenant.id, customerId, actorUserId: u.id,
    locationId: m.location_id, amountCents: Math.round(amountDollars * 100),
    idempotencyKey, note: "Staff award",
  });
  if (r.ok) {
    await evaluateEventTriggers(tenant.id, customerId, "award");
    if (r.rewardIssued) await evaluateEventTriggers(tenant.id, customerId, "reward", r.rewardIssued.label);
  }
  return { ...r, progress: r.ok ? await getProgress(tenant.id, customerId) : undefined };
}

export async function redeemRewardAction(slug: string, rewardId: string) {
  const { u, tenant } = await staffTenant(slug);
  return redeemReward({ tenantId: tenant.id, rewardId, actorUserId: u.id });
}
