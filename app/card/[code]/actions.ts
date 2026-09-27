"use server";
import { createServiceSupabase } from "@/lib/supabase";

// Customer preference center: toggles write new consent_events (history preserved).
export async function updatePreferences(formData: FormData) {
  const svc = createServiceSupabase();
  const code = String(formData.get("code")).toUpperCase();
  const { data: customer } = await svc.from("customers").select("id, tenant_id, phone, email").eq("referral_code", code).single();
  if (!customer) throw new Error("Card not found.");
  const sms = formData.get("sms") === "on";
  const email = formData.get("email") === "on";
  const { data: tenant } = await svc.from("tenants").select("name").eq("id", customer.tenant_id).single();

  for (const [channel, want, addr] of [["sms", sms, customer.phone], ["email", email, customer.email]] as const) {
    if (!addr) continue;
    const { data: latest } = await svc.from("consent_events").select("status").eq("customer_id", customer.id).eq("channel", channel).order("created_at", { ascending: false }).limit(1).single();
    const currentlyIn = latest?.status === "opted_in";
    if (want !== currentlyIn) {
      await svc.from("consent_events").insert({
        tenant_id: customer.tenant_id, customer_id: customer.id, channel,
        status: want ? "opted_in" : "opted_out",
        source: "preference_center",
        evidence: want ? `Opted in via card preferences for ${tenant?.name}` : `Opted out via card preferences (STOP/unsubscribe equivalent)`,
      });
    }
  }
}
