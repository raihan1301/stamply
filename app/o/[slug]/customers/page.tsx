import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default async function CustomersPage({ params, searchParams }: { params: { slug: string }; searchParams: { q?: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m) redirect("/login");
  const svc = createServiceSupabase();
  const q = (searchParams.q ?? "").trim();
  let query = svc.from("customers").select("id, name, phone, email, created_at, customer_programs(stamps, points, lifetime_visits, lifetime_spend_cents)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data: customers } = await query;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Customers</h2>
        <form className="flex gap-2">
          <input name="q" className="input !w-56" placeholder="Search name, phone, email" defaultValue={q} />
          <button className="btn-secondary text-sm">Search</button>
        </form>
      </div>
      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500 border-b border-stone-200">
            <th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Progress</th><th className="px-4 py-3">Visits</th><th className="px-4 py-3">Spend</th>
          </tr></thead>
          <tbody>
            {(customers ?? []).map((c: any) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-3"><a className="font-semibold text-brand-600" href={`/o/${params.slug}/customers/${c.id}`}>{c.name}</a></td>
                <td className="px-4 py-3 text-ink-500">{c.phone ?? c.email ?? "—"}</td>
                <td className="px-4 py-3">{tenant.reward_mode === "visits" ? `${c.customer_programs?.stamps ?? 0}/${tenant.stamp_threshold} stamps` : `${c.customer_programs?.points ?? 0}/${tenant.points_threshold} pts`}</td>
                <td className="px-4 py-3">{c.customer_programs?.lifetime_visits ?? 0}</td>
                <td className="px-4 py-3">{money(c.customer_programs?.lifetime_spend_cents ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!customers || customers.length === 0) && <p className="p-6 text-ink-500 text-sm">No customers yet.</p>}
      </div>
    </div>
  );
}
