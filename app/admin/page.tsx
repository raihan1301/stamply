import { redirect } from "next/navigation";
import { requireUser, isPlatformAdmin } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { createTenant, updateTenantCaps, toggleKillSwitch, setTenantStatus } from "./actions";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) redirect("/login");
  const svc = createServiceSupabase();
  const { data: tenants } = await svc.from("tenants").select("*").order("created_at", { ascending: false });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Platform Admin</h1>
      <p className="text-ink-500 mb-6">Manage client businesses, limits, and kill switches.</p>

      <div className="card mb-8">
        <h2 className="font-bold mb-3">Add a new business</h2>
        <form action={createTenant} className="grid sm:grid-cols-4 gap-3">
          <input name="name" className="input" placeholder="Business name" required />
          <select name="business_type" className="input" defaultValue="restaurant">
            <option value="restaurant">Restaurant</option>
            <option value="barber">Barber</option>
            <option value="coffee">Coffee shop</option>
            <option value="salon">Salon</option>
            <option value="other">Other</option>
          </select>
          <input name="city" className="input" placeholder="City" defaultValue="Kitchener" />
          <button className="btn-primary">Create business</button>
        </form>
      </div>

      <div className="space-y-4">
        {(tenants ?? []).map((t) => (
          <div key={t.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-bold text-lg">{t.name} <span className="text-sm font-normal text-stone-400">/{t.slug}</span></h3>
                <p className="text-sm text-ink-500 capitalize">{t.business_type} · {t.city} ·
                  <span className={t.status === "active" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}> {t.status}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`/o/${t.slug}/dashboard`} className="btn-secondary text-sm">Open dashboard</a>
                <form action={setTenantStatus}>
                  <input type="hidden" name="tenant_id" value={t.id} />
                  <input type="hidden" name="status" value={t.status === "active" ? "suspended" : "active"} />
                  <button className="btn-secondary text-sm">{t.status === "active" ? "Suspend" : "Reactivate"}</button>
                </form>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <form action={updateTenantCaps} className="flex items-end gap-2">
                <input type="hidden" name="tenant_id" value={t.id} />
                <div><label className="label">SMS / month</label><input name="sms_limit" type="number" className="input" defaultValue={t.sms_limit} /></div>
                <div><label className="label">Emails / month</label><input name="email_limit" type="number" className="input" defaultValue={t.email_limit} /></div>
                <button className="btn-secondary text-sm">Save limits</button>
              </form>
              <div>
                <p className="label">Kill switches (instant)</p>
                <div className="flex flex-wrap gap-2">
                  {["marketing_paused", "sms_paused", "redemption_paused"].map((f) => (
                    <form key={f} action={toggleKillSwitch}>
                      <input type="hidden" name="tenant_id" value={t.id} />
                      <input type="hidden" name="field" value={f} />
                      <button className={`text-sm px-3 py-1.5 rounded-full font-semibold ${(t as any)[f] ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                        {(t as any)[f] ? "⏸ " : "▶ "}{f.replace("_paused", "").replace("_", " ")}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {(!tenants || tenants.length === 0) && <p className="text-ink-500">No businesses yet. Create the first one above.</p>}
      </div>
    </div>
  );
}
