import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export default async function AuditPage({ params }: { params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m || !["platform_admin", "owner"].includes(m.role)) redirect("/login");
  const svc = createServiceSupabase();
  const { data: events } = await svc.from("audit_events")
    .select("id, action, target_type, reason, created_at, actor:users(name)")
    .eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100);

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold mb-4">Audit log</h2>
      <p className="text-sm text-ink-500 mb-4">Every important action, who did it, and when. Records can't be edited or deleted.</p>
      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500 border-b border-stone-200">
            <th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th>
          </tr></thead>
          <tbody>
            {(events ?? []).map((e: any) => (
              <tr key={e.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-2.5 text-stone-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5">{e.actor?.name ?? "system"}</td>
                <td className="px-4 py-2.5 font-medium">{e.action.replaceAll("_", " ")}</td>
                <td className="px-4 py-2.5 text-ink-500">{e.reason ?? `${e.target_type}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!events || events.length === 0) && <p className="p-6 text-ink-500 text-sm">Nothing yet.</p>}
      </div>
    </div>
  );
}
