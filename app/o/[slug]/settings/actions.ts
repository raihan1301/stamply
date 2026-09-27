"use server";
import { revalidatePath } from "next/cache";
import { createServiceSupabase } from "@/lib/supabase";
import { requireUser, membershipFor } from "@/lib/auth";

async function requireOwner(slug: string) {
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("id").eq("slug", slug).single();
  return { u, tenant: tenant! };
}

// Invite a staff member: creates their login (Supabase Auth, hashed password)
// plus their staff membership in one step.
export async function inviteStaff(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { u, tenant } = await requireOwner(slug);
  const svc = createServiceSupabase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "staff");
  if (!email || !name) throw new Error("Name and email are required.");
  if (!["staff", "manager"].includes(role)) throw new Error("Bad role.");

  const password = `Stamply#${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`;
  const { data: authUser, error: authErr } = await svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (authErr || !authUser.user) throw new Error("Could not create login (email may already be in use).");

  const { data: userRow } = await svc.from("users").insert({ auth_id: authUser.user.id, email, name }).select("id").single();
  if (!userRow) throw new Error("Could not create staff record.");
  await svc.from("memberships").insert({ user_id: userRow.id, tenant_id: tenant.id, role });
  await svc.from("audit_events").insert({
    tenant_id: tenant.id, actor_user_id: u.id, action: "STAFF_INVITED",
    target_type: "user", target_id: userRow.id, reason: `${name} <${email}> as ${role}`,
  });
  revalidatePath(`/o/${slug}/settings`);
  return { email, password }; // shown once to the owner
}

export async function removeStaff(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { tenant } = await requireOwner(slug);
  const svc = createServiceSupabase();
  await svc.from("memberships").delete().eq("id", String(formData.get("membership_id"))).eq("tenant_id", tenant.id);
  revalidatePath(`/o/${slug}/settings`);
}
