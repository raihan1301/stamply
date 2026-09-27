import { redirect } from "next/navigation";
import { createServerSupabase, createServiceSupabase } from "./supabase";

export type Role = "platform_admin" | "owner" | "manager" | "staff";

export interface Membership {
  id: string;
  tenant_id: string | null;
  role: Role;
  location_id: string | null;
  tenant?: { id: string; name: string; slug: string; status: string };
}

export interface SessionUser {
  id: string; // users.id
  auth_id: string;
  email: string;
  name: string;
  memberships: Membership[];
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createServerSupabase();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const svc = createServiceSupabase();
  const { data: user } = await svc.from("users").select("id, auth_id, email, name, status").eq("auth_id", authUser.id).single();
  if (!user || user.status !== "active") return null;
  const { data: memberships } = await svc
    .from("memberships")
    .select("id, tenant_id, role, location_id, tenant:tenants(id, name, slug, status)")
    .eq("user_id", user.id);
  return { ...user, memberships: ((memberships ?? []) as unknown) as Membership[] };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export function isPlatformAdmin(u: SessionUser) {
  return u.memberships.some((m) => m.role === "platform_admin");
}

// Returns the membership for a tenant slug, or null. Platform admins pass through.
export function membershipFor(u: SessionUser, tenantSlug: string): Membership | null {
  if (isPlatformAdmin(u)) {
    const m = u.memberships.find((x) => x.tenant?.slug === tenantSlug);
    if (m) return m;
    // platform admin without explicit membership: synthesize access
    return { id: "admin", tenant_id: null, role: "platform_admin", location_id: null };
  }
  return u.memberships.find((m) => m.tenant?.slug === tenantSlug) ?? null;
}

export async function getTenantBySlug(slug: string) {
  const svc = createServiceSupabase();
  const { data } = await svc.from("tenants").select("*").eq("slug", slug).single();
  return data;
}
