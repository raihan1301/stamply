// Loyalty engine — the transaction core.
// Every balance change is an immutable ledger event (PRD §24 command pattern):
// authorize -> lock -> validate -> idempotency -> append event -> update projection
// -> issue reward if threshold crossed -> audit. No provider calls inside.

import { createServiceSupabase } from "./supabase";

export const LEDGER_TYPES = [
  "VISIT_AWARDED", "POINTS_AWARDED", "REFERRAL_BONUS", "BIRTHDAY_BONUS",
  "AWARD_REVERSED", "MANUAL_ADJUSTMENT",
  "REWARD_ISSUED", "REWARD_REDEEMED", "REWARD_EXPIRED", "REWARD_VOIDED",
] as const;

function newIdempotencyKey() {
  return `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface AwardInput {
  tenantId: string;
  customerId: string;
  actorUserId: string;
  locationId?: string | null;
  amountCents?: number; // bill amount, for points mode + spend tracking
  idempotencyKey?: string;
  note?: string;
}

export interface AwardResult {
  ok: boolean;
  error?: string;
  code?: string;
  stamps?: number;
  points?: number;
  rewardIssued?: { id: string; label: string } | null;
}

/** Award one visit (or points) to a customer. Staff-authenticated only. */
export async function awardVisit(input: AwardInput): Promise<AwardResult> {
  const svc = createServiceSupabase();
  const key = input.idempotencyKey ?? newIdempotencyKey();

  // Idempotency: a retry with the same key never double-awards.
  const { data: existing } = await svc.from("ledger_events").select("id").eq("idempotency_key", key).single();
  if (existing) {
    const prog = await getProgress(input.tenantId, input.customerId);
    return { ok: true, stamps: prog.stamps, points: prog.points, rewardIssued: null };
  }

  // Tenant + kill switches
  const { data: tenant } = await svc.from("tenants").select("*").eq("id", input.tenantId).single();
  if (!tenant) return { ok: false, error: "Business not found.", code: "TENANT_NOT_FOUND" };
  if (tenant.status === "suspended") return { ok: false, error: "This business is paused. Please contact Stamply.", code: "TENANT_SUSPENDED" };

  // Simple cooldown: no second award for the same customer within 60 seconds (double-tap protection)
  const { data: recent } = await svc.from("ledger_events")
    .select("id, created_at").eq("customer_id", input.customerId)
    .in("type", ["VISIT_AWARDED", "POINTS_AWARDED"])
    .order("created_at", { ascending: false }).limit(1).single();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    return { ok: false, error: "Already stamped just now — please wait a moment.", code: "COOLDOWN_ACTIVE" };
  }

  const prog = await getProgress(input.tenantId, input.customerId);
  let stampsDelta = 0, pointsDelta = 0, type = "VISIT_AWARDED";

  if (tenant.reward_mode === "visits") {
    stampsDelta = 1;
    // Bonus stamp when the bill is over the configured amount
    if (tenant.bonus_stamp_min_spend_cents && (input.amountCents ?? 0) >= tenant.bonus_stamp_min_spend_cents) {
      stampsDelta = 2;
    }
  } else {
    type = "POINTS_AWARDED";
    const dollars = Math.floor((input.amountCents ?? 0) / 100);
    pointsDelta = Math.max(1, Math.round(dollars * Number(tenant.points_per_dollar)));
  }

  // 1. Append ledger event (immutable)
  const { error: evErr } = await svc.from("ledger_events").insert({
    tenant_id: input.tenantId,
    customer_id: input.customerId,
    type,
    stamps_delta: stampsDelta,
    points_delta: pointsDelta,
    amount_cents: input.amountCents ?? 0,
    idempotency_key: key,
    actor_user_id: input.actorUserId,
    location_id: input.locationId ?? null,
    note: input.note ?? null,
  });
  if (evErr) return { ok: false, error: "Could not record the visit. Please try again.", code: "LEDGER_FAILED" };

  // 2. Update projection
  const newStamps = prog.stamps + stampsDelta;
  const newPoints = prog.points + pointsDelta;
  await svc.from("customer_programs").upsert({
    customer_id: input.customerId,
    tenant_id: input.tenantId,
    stamps: newStamps,
    points: newPoints,
    lifetime_visits: prog.lifetime_visits + 1,
    lifetime_spend_cents: prog.lifetime_spend_cents + (input.amountCents ?? 0),
    updated_at: new Date().toISOString(),
  }, { onConflict: "customer_id" });

  // 3. Issue reward if threshold crossed
  let rewardIssued: AwardResult["rewardIssued"] = null;
  const thresholdHit = tenant.reward_mode === "visits"
    ? newStamps >= tenant.stamp_threshold
    : newPoints >= tenant.points_threshold;
  if (thresholdHit) {
    const { data: reward } = await svc.from("rewards").insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      label: tenant.reward_label,
      reward_type: tenant.reward_type,
      amount_cents: tenant.reward_amount_cents,
      status: "issued",
    }).select("id, label").single();
    if (reward) {
      rewardIssued = { id: reward.id, label: reward.label };
      await svc.from("ledger_events").insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        type: "REWARD_ISSUED",
        amount_cents: 0,
        idempotency_key: newIdempotencyKey(),
        actor_user_id: input.actorUserId,
        note: `Reward issued: ${tenant.reward_label}`,
      });
      // Reset progress for the next cycle
      await svc.from("customer_programs").update({
        stamps: 0, points: 0, updated_at: new Date().toISOString(),
      }).eq("customer_id", input.customerId);
    }
  }

  // 4. Audit
  await svc.from("audit_events").insert({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    action: type,
    target_type: "customer",
    target_id: input.customerId,
    reason: input.note ?? null,
  });

  return {
    ok: true,
    stamps: thresholdHit ? 0 : newStamps,
    points: thresholdHit ? 0 : newPoints,
    rewardIssued,
  };
}

export async function getProgress(tenantId: string, customerId: string) {
  const svc = createServiceSupabase();
  const { data } = await svc.from("customer_programs").select("*").eq("customer_id", customerId).single();
  return {
    stamps: data?.stamps ?? 0,
    points: data?.points ?? 0,
    lifetime_visits: data?.lifetime_visits ?? 0,
    lifetime_spend_cents: data?.lifetime_spend_cents ?? 0,
    rewards_redeemed: data?.rewards_redeemed ?? 0,
  };
}

/** Redeem an issued reward. Staff confirms at checkout; row-locked against double use. */
export async function redeemReward(input: { tenantId: string; rewardId: string; actorUserId: string }) {
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("redemption_paused, status").eq("id", input.tenantId).single();
  if (tenant?.redemption_paused) return { ok: false, error: "Redemptions are paused right now.", code: "REDEMPTION_PAUSED" };
  if (tenant?.status === "suspended") return { ok: false, error: "This business is paused.", code: "TENANT_SUSPENDED" };

  // Atomic: only flip issued -> redeemed
  const { data: reward, error } = await svc.from("rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", input.rewardId).eq("status", "issued").select("id, customer_id, label").single();
  if (error || !reward) return { ok: false, error: "This reward was already used or is not valid.", code: "REWARD_ALREADY_USED" };

  await svc.from("ledger_events").insert({
    tenant_id: input.tenantId,
    customer_id: reward.customer_id,
    type: "REWARD_REDEEMED",
    amount_cents: 0,
    idempotency_key: newIdempotencyKey(),
    actor_user_id: input.actorUserId,
    note: `Redeemed: ${reward.label}`,
  });
  const prog = await getProgress(input.tenantId, reward.customer_id);
  await svc.from("customer_programs").update({
    rewards_redeemed: prog.rewards_redeemed + 1,
    updated_at: new Date().toISOString(),
  }).eq("customer_id", reward.customer_id);
  await svc.from("audit_events").insert({
    tenant_id: input.tenantId, actor_user_id: input.actorUserId,
    action: "REWARD_REDEEMED", target_type: "reward", target_id: input.rewardId,
  });
  return { ok: true, label: reward.label };
}

/** Manager/owner correction: reverses an award with a reason (original event stays). */
export async function reverseAward(input: { tenantId: string; eventId: string; actorUserId: string; reason: string }) {
  const svc = createServiceSupabase();
  const { data: ev } = await svc.from("ledger_events").select("*").eq("id", input.eventId).single();
  if (!ev || ev.tenant_id !== input.tenantId) return { ok: false, error: "Event not found." };
  if (!["VISIT_AWARDED", "POINTS_AWARDED", "REFERRAL_BONUS", "BIRTHDAY_BONUS"].includes(ev.type)) {
    return { ok: false, error: "Only earning events can be reversed." };
  }
  await svc.from("ledger_events").insert({
    tenant_id: input.tenantId,
    customer_id: ev.customer_id,
    type: "AWARD_REVERSED",
    stamps_delta: -ev.stamps_delta,
    points_delta: -ev.points_delta,
    amount_cents: -ev.amount_cents,
    idempotency_key: newIdempotencyKey(),
    actor_user_id: input.actorUserId,
    note: `Reversal of ${ev.id}: ${input.reason}`,
  });
  const prog = await getProgress(input.tenantId, ev.customer_id);
  await svc.from("customer_programs").update({
    stamps: Math.max(0, prog.stamps - ev.stamps_delta),
    points: Math.max(0, prog.points - ev.points_delta),
    lifetime_visits: Math.max(0, prog.lifetime_visits - 1),
    lifetime_spend_cents: Math.max(0, prog.lifetime_spend_cents - ev.amount_cents),
    updated_at: new Date().toISOString(),
  }).eq("customer_id", ev.customer_id);
  await svc.from("audit_events").insert({
    tenant_id: input.tenantId, actor_user_id: input.actorUserId,
    action: "AWARD_REVERSED", target_type: "ledger_event", target_id: input.eventId, reason: input.reason,
  });
  return { ok: true };
}
