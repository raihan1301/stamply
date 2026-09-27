import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default async function OwnerDashboard({ params }: { params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m) redirect("/login");
  const svc = createServiceSupabase();

  const [{ count: enrolled }, { data: progs }, { data: recentEvents }, { data: rewards }] = await Promise.all([
    svc.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    svc.from("customer_programs").select("lifetime_visits, lifetime_spend_cents").eq("tenant_id", tenant.id),
    svc.from("ledger_events").select("id, type, amount_cents, created_at, customer:customers(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(8),
    svc.from("rewards").select("id, status").eq("tenant_id", tenant.id),
  ]);
  const visits = (progs ?? []).reduce((s, p) => s + p.lifetime_visits, 0);
  const spend = (progs ?? []).reduce((s, p) => s + p.lifetime_spend_cents, 0);
  const issued = (rewards ?? []).filter((r) => r.status === "issued").length;
  const redeemed = (rewards ?? []).filter((r) => r.status === "redeemed").length;

  const { data: top } = await svc.from("customers").select("id, name, customer_programs(lifetime_visits, lifetime_spend_cents, stamps, points)").eq("tenant_id", tenant.id).limit(50);
  const topSorted = (top ?? []).map((c: any) => ({ ...c, p: c.customer_programs })).sort((a: any, b: any) => (b.p?.lifetime_visits ?? 0) - (a.p?.lifetime_visits ?? 0)).slice(0, 5);

  const stats = [
    ["Customers enrolled", String(enrolled ?? 0)],
    ["Total visits", String(visits)],
    ["Total spend tracked", money(spend)],
    ["Rewards waiting", String(issued)],
    ["Rewards redeemed", String(redeemed)],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {stats.map(([label, value]) => (
          <div key={label} className="card"><p className="text-2xl font-bold">{value}</p><p className="text-sm text-ink-500">{label}</p></div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-bold mb-3">Top customers</h2>
          {topSorted.length === 0 && <p className="text-sm text-ink-500">No customers yet. Share your QR code to start enrolling.</p>}
          {topSorted.map((c: any) => (
            <a key={c.id} href={`/o/${params.slug}/customers/${c.id}`} className="flex justify-between py-2 border-b border-stone-100 last:border-0 hover:bg-stone-50 rounded px-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-sm text-ink-500">{c.p?.lifetime_visits ?? 0} visits · {money(c.p?.lifetime_spend_cents ?? 0)}</span>
            </a>
          ))}
        </div>
        <div className="card">
          <h2 className="font-bold mb-3">Latest activity</h2>
          {(recentEvents ?? []).map((e: any) => (
            <div key={e.id} className="flex justify-between py-2 border-b border-stone-100 last:border-0 text-sm">
              <span><b>{e.customer?.name}</b> · {e.type.replaceAll("_", " ").toLowerCase()}</span>
              <span className="text-stone-400">{new Date(e.created_at).toLocaleDateString()}</span>
            </div>
          ))}
          {(!recentEvents || recentEvents.length === 0) && <p className="text-sm text-ink-500">No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
