"use server";
import { revalidatePath } from "next/cache";
import { requireUser, membershipFor } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { reverseAward } from "@/lib/loyalty";

export async function reverseAwardAction(formData: FormData) {
  const slug = String(formData.get("slug"));
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner", "manager"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("id").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required.");
  const r = await reverseAward({ tenantId: tenant.id, eventId: String(formData.get("event_id")), actorUserId: u.id, reason });
  if (!r.ok) throw new Error(r.error);
  revalidatePath(`/o/${slug}/customers/${formData.get("customer_id")}`);
}
