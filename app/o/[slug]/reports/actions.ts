"use server";
import { requireUser, membershipFor } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";

export async function exportCustomersCsv(slug: string) {
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner", "manager"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("id").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  const { data } = await svc.from("customers").select("name, phone, email, birthday, created_at, customer_programs(stamps, points, lifetime_visits, lifetime_spend_cents)").eq("tenant_id", tenant.id);
  const rows = [["name", "phone", "email", "birthday", "enrolled", "stamps", "points", "visits", "spend_cents"]];
  for (const c of data ?? []) {
    const p: any = (c as any).customer_programs;
    rows.push([c.name, c.phone ?? "", c.email ?? "", c.birthday ?? "", c.created_at, p?.stamps ?? 0, p?.points ?? 0, p?.lifetime_visits ?? 0, p?.lifetime_spend_cents ?? 0].map(String));
  }
  return rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
}
