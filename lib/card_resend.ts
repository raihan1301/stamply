// "Lost your card link?" resend logic.
// One input (phone OR email) -> look up the customer -> send their personal
// card URL via the transactional pipeline (no consent needed, no usage counted).
// Anti-abuse: max 3 requests/hour per contact, and ALWAYS the same generic
// reply so nobody can probe whether a number/email is registered.
import { createServiceSupabase } from "./supabase";
import { normalizePhone, normalizeEmail, digitsOnly, appBaseUrl, sendTransactional } from "./transactional";

const GENERIC_OK = "If an account matches, we've sent your card link.";
const RESEND_LIMIT_PER_HOUR = 3;

export async function requestCardLink(rawContact: string): Promise<{ message: string }> {
  const svc = createServiceSupabase();
  const trimmed = (rawContact ?? "").trim();
  const isEmail = trimmed.includes("@");
  const contact = isEmail ? normalizeEmail(trimmed) : normalizePhone(trimmed);

  // Rate limit (checked before lookup; the attempt is always logged).
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await svc
    .from("card_link_resends")
    .select("id", { count: "exact", head: true })
    .eq("contact", contact)
    .gte("created_at", hourAgo);
  await svc.from("card_link_resends").insert({ contact });
  if ((count ?? 0) >= RESEND_LIMIT_PER_HOUR) return { message: GENERIC_OK };
  if (!trimmed) return { message: GENERIC_OK };

  // Find the customer. Compare digit-stripped phones and lowercased emails
  // because stored formats vary.
  const { data: customers } = await svc
    .from("customers")
    .select("id, tenant_id, name, email, phone, referral_code")
    .order("created_at", { ascending: false })
    .limit(500);

  let customer: any = null;
  if (isEmail) {
    customer = (customers ?? []).find((c: any) => normalizeEmail(c.email ?? "") === contact) ?? null;
  } else {
    const want = digitsOnly(contact);
    customer =
      (customers ?? []).find((c: any) => {
        const d = digitsOnly(c.phone);
        return d !== "" && (d === want || (want.length >= 10 && d.endsWith(want.slice(-10))));
      }) ?? null;
  }
  if (!customer) return { message: GENERIC_OK };

  const { data: tenant } = await svc.from("tenants").select("name").eq("id", customer.tenant_id).single();
  const business = tenant?.name ?? "your shop";
  const firstName = String(customer.name ?? "friend").split(" ")[0];
  const url = `${appBaseUrl()}/card/${customer.referral_code}`;

  if (isEmail) {
    await sendTransactional({
      tenantId: customer.tenant_id,
      customerId: customer.id,
      channel: "email",
      to: customer.email,
      subject: `Your ${business} loyalty card link`,
      body:
        `Hi ${firstName},\n\n` +
        `Here is your ${business} loyalty card link:\n${url}\n\n` +
        `Save it, or add it to your home screen, so you always have it.\n\n` +
        `— ${business}`,
    });
  } else {
    await sendTransactional({
      tenantId: customer.tenant_id,
      customerId: customer.id,
      channel: "sms",
      to: customer.phone,
      body: `Hi ${firstName}! Your ${business} loyalty card link: ${url} — save it or add it to your home screen.`,
    });
  }
  return { message: GENERIC_OK };
}
