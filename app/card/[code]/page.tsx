import { createServiceSupabase } from "@/lib/supabase";
import { hasConsent } from "@/lib/campaigns";
import { notFound } from "next/navigation";
import { updatePreferences } from "./actions";

export default async function CardPage({ params }: { params: { code: string } }) {
  const svc = createServiceSupabase();
  const code = params.code.toUpperCase();
  const { data: customer } = await svc.from("customers").select("*, customer_programs(*)").eq("referral_code", code).single();
  if (!customer) notFound();
  const { data: tenant } = await svc.from("tenants").select("*").eq("id", customer.tenant_id).single();
  const { data: rewards } = await svc.from("rewards").select("*").eq("customer_id", customer.id).order("issued_at", { ascending: false });
  const [smsIn, emailIn] = await Promise.all([
    hasConsent(customer.tenant_id, customer.id, "sms"),
    hasConsent(customer.tenant_id, customer.id, "email"),
  ]);

  const prog = customer.customer_programs;
  const max = tenant.reward_mode === "visits" ? tenant.stamp_threshold : tenant.points_threshold;
  const cur = tenant.reward_mode === "visits" ? prog?.stamps ?? 0 : prog?.points ?? 0;
  const dots = tenant.reward_mode === "visits" ? Array.from({ length: max }) : [];

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="card text-center mb-4 bg-gradient-to-br from-ink-900 to-ink-700 !text-white !border-0">
        <p className="text-sm opacity-70">{tenant.name}</p>
        <h1 className="text-2xl font-bold my-1">Hi {customer.name.split(" ")[0]}! 👋</h1>
        {tenant.reward_mode === "visits" ? (
          <div className="flex flex-wrap justify-center gap-2 my-4">
            {dots.map((_, i) => (
              <span key={i} className={`stamp-dot ${i < cur ? "bg-brand-500 text-white" : "bg-white/20 text-white/60"}`}>{i < cur ? "★" : i + 1}</span>
            ))}
          </div>
        ) : (
          <p className="text-4xl font-black my-4">{cur} <span className="text-lg font-normal opacity-70">/ {max} pts</span></p>
        )}
        <p className="text-sm opacity-80">{max - cur > 0 ? `${max - cur} to go — ${tenant.reward_label} awaits!` : "Reward ready! Show this to staff."}</p>
      </div>

      {(rewards ?? []).filter((r: any) => r.status === "issued").length > 0 && (
        <div className="card mb-4 !border-green-200 bg-green-50">
          <h3 className="font-bold mb-2">🎁 Your rewards</h3>
          {(rewards ?? []).filter((r: any) => r.status === "issued").map((r: any) => (
            <div key={r.id} className="bg-white rounded-xl p-3 mb-2 text-center">
              <p className="font-bold">{r.label}</p>
              <p className="text-xs text-ink-500">Show this screen to staff to redeem</p>
            </div>
          ))}
        </div>
      )}

      <div className="card mb-4">
        <h3 className="font-bold mb-2">Invite friends</h3>
        <p className="text-sm text-ink-500 mb-2">Share your link — you both get bonus stamps when they join.</p>
        <code className="block bg-stone-100 rounded-xl p-3 text-sm break-all">/join/{tenant.slug}?ref={customer.referral_code}</code>
      </div>

      <div className="card">
        <h3 className="font-bold mb-2">Message preferences</h3>
        <form action={updatePreferences} className="space-y-2 text-sm">
          <input type="hidden" name="code" value={code} />
          <label className="flex items-center gap-2"><input type="checkbox" name="sms" defaultChecked={smsIn} /> Text me offers & rewards</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="email" defaultChecked={emailIn} /> Email me offers & rewards</label>
          <button className="btn-secondary text-sm mt-2">Save preferences</button>
        </form>
      </div>
    </div>
  );
}
