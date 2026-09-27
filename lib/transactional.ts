// Transactional (non-marketing) messaging.
// Used for things the customer asked for: card-link resends, receipts, etc.
// No CASL consent check, no frequency cap, no monthly usage counting.
// Every send is still logged to the messages table with kind='transactional'.
// Provider-agnostic: lights up automatically when Twilio/SES keys are set.
import { createServiceSupabase } from "./supabase";
import { sendSms, sendEmail, isSimulator } from "./messaging";

export type TxChannel = "sms" | "email";

/** Normalize a phone number to E.164-ish form. 10 digits -> assume North America. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim().startsWith("+") ? raw.trim() : `+${digits}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Digits only — for comparing phone numbers stored in different formats. */
export function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://stamply-tau.vercel.app").replace(/\/$/, "");
}

export async function sendTransactional(opts: {
  tenantId: string;
  customerId: string;
  channel: TxChannel;
  to: string;
  subject?: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const svc = createServiceSupabase();
  const { data: tenant } = await svc
    .from("tenants")
    .select("id, name, status, sms_paused")
    .eq("id", opts.tenantId)
    .single();
  if (!tenant) return { ok: false, reason: "Business not found" };
  if (tenant.status === "suspended") return { ok: false, reason: "Business paused" };
  if (opts.channel === "sms" && tenant.sms_paused) return { ok: false, reason: "SMS paused for this business" };

  try {
    const res =
      opts.channel === "sms"
        ? await sendSms(opts.to, opts.body)
        : await sendEmail(opts.to, opts.subject ?? `Your loyalty card`, opts.body);
    await svc.from("messages").insert({
      tenant_id: opts.tenantId,
      campaign_id: null,
      customer_id: opts.customerId,
      channel: opts.channel,
      status: "sent",
      provider_message_id: res.providerId,
      simulated: isSimulator(),
      kind: "transactional",
    });
    return { ok: true };
  } catch (e: any) {
    await svc.from("messages").insert({
      tenant_id: opts.tenantId,
      campaign_id: null,
      customer_id: opts.customerId,
      channel: opts.channel,
      status: "failed",
      simulated: isSimulator(),
      kind: "transactional",
      error: String(e?.message ?? e),
    });
    return { ok: false, reason: "Send failed" };
  }
}
