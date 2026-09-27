"use server";
import { revalidatePath } from "next/cache";
import { createServiceSupabase } from "@/lib/supabase";
import { requireUser, isPlatformAdmin } from "@/lib/auth";

async function requireAdmin() {
  const u = await requireUser();
  if (!isPlatformAdmin(u)) throw new Error("Not allowed.");
  return u;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || `shop-${Date.now().toString(36)}`;
}

export async function createTenant(formData: FormData) {
  const admin = await requireAdmin();
  const svc = createServiceSupabase();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Business name is required.");
  const slug = slugify(name);
  const { data: tenant, error } = await svc.from("tenants").insert({
    name, slug,
    business_type: String(formData.get("business_type") ?? "restaurant"),
    city: String(formData.get("city") ?? "Kitchener"),
    reward_mode: "visits",
    stamp_threshold: 8,
    reward_label: "Free item",
  }).select().single();
  if (error) throw new Error("Could not create the business (name may already exist).");
  await svc.from("locations").insert({ tenant_id: tenant.id, name: "Main location" });
  await svc.from("audit_events").insert({
    tenant_id: tenant.id, actor_user_id: admin.id, action: "TENANT_CREATED",
    target_type: "tenant", target_id: tenant.id, reason: `Created ${name}`,
  });
  revalidatePath("/admin");
}

export async function updateTenantCaps(formData: FormData) {
  await requireAdmin();
  const svc = createServiceSupabase();
  const id = String(formData.get("tenant_id"));
  await svc.from("tenants").update({
    sms_limit: Number(formData.get("sms_limit") ?? 300),
    email_limit: Number(formData.get("email_limit") ?? 5000),
  }).eq("id", id);
  revalidatePath("/admin");
}

export async function toggleKillSwitch(formData: FormData) {
  const admin = await requireAdmin();
  const svc = createServiceSupabase();
  const id = String(formData.get("tenant_id"));
  const field = String(formData.get("field"));
  if (!["marketing_paused", "sms_paused", "redemption_paused"].includes(field)) throw new Error("Bad switch.");
  const { data: t } = await svc.from("tenants").select(field).eq("id", id).single();
  const next = !(t as any)?.[field];
  await svc.from("tenants").update({ [field]: next }).eq("id", id);
  await svc.from("audit_events").insert({
    tenant_id: id, actor_user_id: admin.id, action: "KILL_SWITCH",
    target_type: "tenant", target_id: id, reason: `${field} -> ${next}`,
  });
  revalidatePath("/admin");
}

export async function setTenantStatus(formData: FormData) {
  const admin = await requireAdmin();
  const svc = createServiceSupabase();
  const id = String(formData.get("tenant_id"));
  const status = String(formData.get("status"));
  if (!["active", "suspended"].includes(status)) throw new Error("Bad status.");
  await svc.from("tenants").update({ status }).eq("id", id);
  await svc.from("audit_events").insert({
    tenant_id: id, actor_user_id: admin.id, action: "TENANT_STATUS",
    target_type: "tenant", target_id: id, reason: `status -> ${status}`,
  });
  revalidatePath("/admin");
}
