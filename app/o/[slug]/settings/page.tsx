import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { inviteStaff, removeStaff } from "./actions";
import InviteForm from "./invite-form";

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m || !["platform_admin", "owner"].includes(m.role)) redirect("/login");
  const svc = createServiceSupabase();
  const { data: staff } = await svc.from("memberships")
    .select("id, role, user:users(name, email)").eq("tenant_id", tenant.id)
    .in("role", ["owner", "manager", "staff"]).order("created_at");

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-1">Settings</h2>
      <p className="text-ink-500 mb-6">Your team and locations.</p>

      <div className="card mb-6">
        <h3 className="font-bold mb-3">Team</h3>
        {(staff ?? []).map((s: any) => (
          <div key={s.id} className="flex justify-between items-center py-2 border-b border-stone-100 last:border-0 text-sm">
            <span><b>{s.user?.name}</b> <span className="text-stone-400">{s.user?.email}</span></span>
            <span className="flex items-center gap-2">
              <span className="bg-stone-100 rounded-full px-2 py-0.5 text-xs capitalize">{s.role}</span>
              {s.role !== "owner" && (
                <form action={removeStaff}>
                  <input type="hidden" name="slug" value={params.slug} />
                  <input type="hidden" name="membership_id" value={s.id} />
                  <button className="text-xs text-red-600">Remove</button>
                </form>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="font-bold mb-3">Invite staff</h3>
        <p className="text-sm text-ink-500 mb-3">Creates their login. Share the temporary password with them once — they'll be asked to keep it safe.</p>
        <InviteForm slug={params.slug} />
      </div>
    </div>
  );
}
