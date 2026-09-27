import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect, notFound } from "next/navigation";
import { reverseAwardAction } from "./actions";

function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default async function CustomerDetail({ params }: { params: { slug: string; id: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m) redirect("/login");
  const svc = createServiceSupabase();
  const { data: customer } = await svc.from("customers").select("*, customer_programs(*)").eq("id", params.id).eq("tenant_id", tenant.id).single();
  if (!customer) notFound();
  const [{ data: events }, { data: rewards }, { data: consent }] = await Promise.all([
    svc.from("ledger_events").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(50),
    svc.from("rewards").select("*").eq("customer_id", customer.id).order("issued_at", { ascending: false }),
    svc.from("consent_events").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(6),
  ]);
  const prog = customer.customer_programs;
  const progress = tenant.reward_mode === "visits"
    ? { cur: prog?.stamps ?? 0, max: tenant.stamp_threshold, unit: "stamps" }
    : { cur: prog?.points ?? 0, max: tenant.points_threshold, unit: "points" };

  return (
    <div className="max-w-4xl">
      <a href={`/o/${params.slug}/customers`} className="text-sm text-brand-600">← All customers</a>
      <div className="card mt-3 mb-4">
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">{customer.name}</h2>
            <p className="text-sm text-ink-500">{customer.phone ?? "no phone"} · {customer.email ?? "no email"}{customer.birthday ? ` · 🎂 ${customer.birthday}` : ""}</p>
          </div>
          <div className="text-right text-sm">
            <p><b>{prog?.lifetime_visits ?? 0}</b> visits · <b>{money(prog?.lifetime_spend_cents ?? 0)}</b> spend</p>
            <p className="text-ink-500">since {new Date(customer.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1"><span className="font-semibold">{progress.cur} / {progress.max} {progress.unit}</span><span className="text-ink-500">toward: {tenant.reward_label}</span></div>
          <div className="h-3 bg-stone-100 rounded-full"><div className="h-3 bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (progress.cur / progress.max) * 100)}%` }} /></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-bold mb-3">Visit & spend history</h3>
          <div className="space-y-2 max-h-96 overflow-auto text-sm">
            {(events ?? []).map((e: any) => (
              <div key={e.id} className="flex justify-between gap-2 border-b border-stone-100 pb-2">
                <div>
                  <p className="font-medium">{e.type.replaceAll("_", " ").toLowerCase()}{e.amount_cents > 0 ? ` · ${money(e.amount_cents)}` : ""}</p>
                  <p className="text-xs text-stone-400">{new Date(e.created_at).toLocaleString()}{e.note ? ` · ${e.note}` : ""}</p>
                </div>
                {["VISIT_AWARDED", "POINTS_AWARDED", "REFERRAL_BONUS", "BIRTHDAY_BONUS"].includes(e.type) && ["platform_admin", "owner", "manager"].includes(m.role) && (
                  <form action={reverseAwardAction} className="flex gap-1 items-start">
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <input type="hidden" name="event_id" value={e.id} />
                    <input name="reason" className="input !py-1 !px-2 !text-xs !w-28" placeholder="Reason" required />
                    <button className="text-xs text-red-600">Reverse</button>
                  </form>
                )}
              </div>
            ))}
            {(!events || events.length === 0) && <p className="text-ink-500 text-sm">No visits yet.</p>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold mb-3">Rewards</h3>
            {(rewards ?? []).map((r: any) => (
              <div key={r.id} className="flex justify-between text-sm py-2 border-b border-stone-100 last:border-0">
                <span>{r.label}</span>
                <span className={`font-semibold ${r.status === "issued" ? "text-green-600" : "text-stone-400"}`}>{r.status}</span>
              </div>
            ))}
            {(!rewards || rewards.length === 0) && <p className="text-ink-500 text-sm">No rewards yet.</p>}
          </div>
          <div className="card">
            <h3 className="font-bold mb-3">Consent (CASL evidence)</h3>
            {(consent ?? []).map((c: any) => (
              <div key={c.id} className="flex justify-between text-sm py-1.5 border-b border-stone-100 last:border-0">
                <span className="capitalize">{c.channel} · {c.source.replaceAll("_", " ")}</span>
                <span className={c.status === "opted_in" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{c.status.replace("_", " ")}</span>
              </div>
            ))}
            {(!consent || consent.length === 0) && <p className="text-ink-500 text-sm">No consent records.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
