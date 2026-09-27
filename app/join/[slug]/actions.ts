"use server";
import { createServiceSupabase } from "@/lib/supabase";

function makeReferralCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function enrollCustomer(formData: FormData) {
  const svc = createServiceSupabase();
  const slug = String(formData.get("slug"));
  const { data: tenant } = await svc.from("tenants").select("id, name, status").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  if (tenant.status === "suspended") throw new Error("This business is paused right now.");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const birthday = String(formData.get("birthday") ?? "") || null;
  if (!name) throw new Error("Please enter your name.");
  if (!phone && !email) throw new Error("Please give a phone number or email so we can reach you about your rewards.");
  const smsOptIn = formData.get("sms_consent") === "on";
  const emailOptIn = formData.get("email_consent") === "on";

  // Duplicate check: same phone or email at this business
  const { data: dup } = await svc.from("customers").select("id")
    .eq("tenant_id", tenant.id)
    .or(`phone.eq.${phone ?? "___none___"},email.eq.${email ?? "___none___"}`)
    .limit(1).single();
  if (dup) throw new Error("You're already enrolled! Ask staff for your card link.");

  const { data: customer, error } = await svc.from("customers").insert({
    tenant_id: tenant.id, name, phone, email, birthday,
    referral_code: makeReferralCode(),
    referred_by: String(formData.get("referred_by") ?? "") || null,
  }).select("id, referral_code").single();
  if (error) throw new Error("Could not enroll. Please try again.");

  await svc.from("customer_programs").insert({ customer_id: customer.id, tenant_id: tenant.id });

  // CASL consent evidence — only checked boxes become opt-ins
  if (smsOptIn && phone) {
    await svc.from("consent_events").insert({
      tenant_id: tenant.id, customer_id: customer.id, channel: "sms",
      status: "opted_in", source: "qr_enrollment", evidence: `QR signup for ${tenant.name}`,
    });
  }
  if (emailOptIn && email) {
    await svc.from("consent_events").insert({
      tenant_id: tenant.id, customer_id: customer.id, channel: "email",
      status: "opted_in", source: "qr_enrollment", evidence: `QR signup for ${tenant.name}`,
    });
  }

  // Referral bonus: the friend who invited them gets a stamp/points bonus
  const refCode = String(formData.get("ref") ?? "").trim().toUpperCase();
  if (refCode) {
    const { data: referrer } = await svc.from("customers").select("id").eq("tenant_id", tenant.id).eq("referral_code", refCode).single();
    if (referrer && referrer.id !== customer.id) {
      const { data: t } = await svc.from("tenants").select("reward_mode").eq("id", tenant.id).single();
      await svc.from("ledger_events").insert({
        tenant_id: tenant.id, customer_id: referrer.id,
        type: "REFERRAL_BONUS",
        stamps_delta: t?.reward_mode === "visits" ? 1 : 0,
        points_delta: t?.reward_mode === "visits" ? 0 : 10,
        idempotency_key: `ref_${customer.id}`,
        note: `Referred ${name}`,
      });
    }
  }

  await svc.from("audit_events").insert({
    tenant_id: tenant.id, action: "CUSTOMER_ENROLLED",
    target_type: "customer", target_id: customer.id, reason: "QR enrollment",
  });

  return { referralCode: customer.referral_code, tenantName: tenant.name };
}
