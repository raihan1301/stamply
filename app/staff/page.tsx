import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { AwardPanel, RedeemButton } from "./panels";

export default async function StaffPage({ searchParams }: { searchParams: { t?: string; q?: string; c?: string } }) {
  const user = await requireUser();
  const slug = searchParams.t;
  if (!slug) {
    const staffMembership = user.memberships.find((mm) => mm.tenant?.slug && ["staff", "manager", "owner"].includes(mm.role));
    if (staffMembership?.tenant?.slug) redirect(`/staff?t=${staffMembership.tenant.slug}`);
    return <div className="max-w-xl mx-auto p-8"><p>No shop assigned to your account. Ask your owner to invite you.</p></div>;
  }
  const tenant = await getTenantBySlug(slug);
  const m = membershipFor(user, slug);
  if (!tenant || !m) redirect("/login");

  const svc = createServiceSupabase();
  const q = (searchParams.q ?? "").trim();
  let customer: any = null;
  let results: any[] = [];
  if (searchParams.c) {
    const { data } = await svc.from("customers").select("*, customer_programs(*), rewards!rewards_customer_id_fkey(id, label, status, issued_at)").eq("id", searchParams.c).eq("tenant_id", tenant.id).single();
    customer = data;
  } else if (q) {
    const { data } = await svc.from("customers").select("id, name, phone").eq("tenant_id", tenant.id)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    results = data ?? [];
  }
  const { data: recent } = await svc.from("ledger_events")
    .select("id, type, created_at, customer:customers(name)").eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false }).limit(10);

  const prog = customer?.customer_programs;
  const progress = tenant.reward_mode === "visits"
    ? { cur: prog?.stamps ?? 0, max: tenant.stamp_threshold, unit: "stamps" }
    : { cur: prog?.points ?? 0, max: tenant.points_threshold, unit: "points" };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Staff — {tenant.name}</h1>
      <p className="text-sm text-ink-500 mb-4">Signed in as {user.name}</p>

      <form className="flex gap-2 mb-4">
        <input type="hidden" name="t" value={slug} />
        <input name="q" className="input" placeholder="Search customer by name or phone" defaultValue={q} />
        <button className="btn-primary">Find</button>
      </form>

      {results.length > 0 && (
        <div className="card mb-4">
          {results.map((r: any) => (
            <a key={r.id} href={`/staff?t=${slug}&c=${r.id}`} className="flex justify-between py-2 border-b border-stone-100 last:border-0">
              <b>{r.name}</b><span className="text-ink-500 text-sm">{r.phone}</span>
            </a>
          ))}
        </div>
      )}

      {customer && (
        <div className="space-y-4 mb-6">
          <div className="card">
            <div className="flex justify-between items-center">
              <div><h2 className="text-lg font-bold">{customer.name}</h2><p className="text-sm text-ink-500">{customer.phone}</p></div>
              <a href={`/staff?t=${slug}`} className="text-sm text-brand-600">← New search</a>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1"><span className="font-semibold">{progress.cur} / {progress.max} {progress.unit}</span></div>
              <div className="h-3 bg-stone-100 rounded-full"><div className="h-3 bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (progress.cur / progress.max) * 100)}%` }} /></div>
            </div>
            {(customer.rewards ?? []).filter((r: any) => r.status === "issued").length > 0 && (
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <p className="text-sm font-bold text-green-800 mb-2">🎁 Rewards ready to redeem:</p>
                {(customer.rewards ?? []).filter((r: any) => r.status === "issued").map((r: any) => (
                  <div key={r.id} className="flex justify-between items-center py-1">
                    <span className="text-sm">{r.label}</span>
                    <RedeemButton slug={slug} rewardId={r.id} label={r.label} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <AwardPanel slug={slug} customerId={customer.id} rewardMode={tenant.reward_mode} />
        </div>
      )}

      <div className="card">
        <h3 className="font-bold mb-2">Recent stamps</h3>
        {(recent ?? []).map((e: any) => (
          <div key={e.id} className="flex justify-between text-sm py-1.5 border-b border-stone-100 last:border-0">
            <span><b>{e.customer?.name}</b> · {e.type.replaceAll("_", " ").toLowerCase()}</span>
            <span className="text-stone-400">{new Date(e.created_at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
