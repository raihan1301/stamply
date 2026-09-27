import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { redirect } from "next/navigation";
import { updateProgram } from "./actions";

export default async function ProgramPage({ params }: { params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m || !["platform_admin", "owner"].includes(m.role)) redirect("/login");

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-1">Reward program</h2>
      <p className="text-ink-500 mb-6">Pick one earning mode. Customers earn toward one reward, then the cycle restarts.</p>
      <form action={updateProgram} className="card space-y-5">
        <input type="hidden" name="slug" value={params.slug} />
        <div>
          <p className="label">Earning mode</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={`border-2 rounded-2xl p-4 cursor-pointer ${tenant.reward_mode === "visits" ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}>
              <input type="radio" name="reward_mode" value="visits" defaultChecked={tenant.reward_mode === "visits"} className="mr-2" />
              <b>Stamp per visit</b>
              <p className="text-sm text-ink-500 mt-1">1 stamp each visit. Simple, like a paper card.</p>
            </label>
            <label className={`border-2 rounded-2xl p-4 cursor-pointer ${tenant.reward_mode === "points" ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}>
              <input type="radio" name="reward_mode" value="points" defaultChecked={tenant.reward_mode === "points"} className="mr-2" />
              <b>Points per dollar</b>
              <p className="text-sm text-ink-500 mt-1">Bigger bills earn faster. Rewards bigger spenders.</p>
            </label>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Stamps needed (visit mode)</label><input name="stamp_threshold" type="number" min={1} className="input" defaultValue={tenant.stamp_threshold} /></div>
          <div><label className="label">Bonus stamp when bill is over $ (visit mode, optional)</label><input name="bonus_stamp_min_spend" type="number" min={0} step="0.01" className="input" defaultValue={tenant.bonus_stamp_min_spend_cents ? (tenant.bonus_stamp_min_spend_cents / 100).toFixed(2) : ""} placeholder="e.g. 25" /></div>
          <div><label className="label">Points per $1 (points mode)</label><input name="points_per_dollar" type="number" min={0.1} step="0.1" className="input" defaultValue={tenant.points_per_dollar} /></div>
          <div><label className="label">Points needed for reward (points mode)</label><input name="points_threshold" type="number" min={1} className="input" defaultValue={tenant.points_threshold} /></div>
        </div>
        <div>
          <p className="label">Reward</p>
          <div className="flex gap-4 mb-3">
            <label><input type="radio" name="reward_type" value="free_item" defaultChecked={tenant.reward_type === "free_item"} className="mr-1" /> Free item</label>
            <label><input type="radio" name="reward_type" value="amount_off" defaultChecked={tenant.reward_type === "amount_off"} className="mr-1" /> Amount off</label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Reward name</label><input name="reward_label" className="input" defaultValue={tenant.reward_label} /></div>
            <div><label className="label">Amount off $ (if amount off)</label><input name="reward_amount" type="number" min={0} step="0.01" className="input" defaultValue={tenant.reward_amount_cents ? (tenant.reward_amount_cents / 100).toFixed(2) : ""} /></div>
          </div>
        </div>
        <button className="btn-primary">Save program</button>
      </form>
    </div>
  );
}
