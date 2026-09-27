import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { getUsage } from "@/lib/campaigns";
import { redirect } from "next/navigation";
import { saveTriggerRule, deleteTriggerRule, createCampaign, sendCampaign } from "./actions";

const TRIGGER_LABELS: Record<string, [string, string]> = {
  near_reward: ["Almost there 🎯", "Fires when a customer is 1 stamp (or 10 points) away from a reward. Once per reward cycle."],
  lapsed_30: ["We miss you 💌", "Fires when a customer hasn't visited in 30 days. Once per month."],
  birthday: ["Birthday treat 🎂", "Fires on the customer's birthday. Once per year."],
  reward_earned: ["Reward ready 🎁", "Fires the moment a reward is earned. Once per reward."],
};

export default async function CampaignsPage({ params, searchParams }: { params: { slug: string }; searchParams: { tab?: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m) redirect("/login");
  const svc = createServiceSupabase();
  const tab = searchParams.tab === "broadcast" ? "broadcast" : "triggers";

  const [{ data: rules }, { data: campaigns }, usage] = await Promise.all([
    svc.from("trigger_rules").select("*").eq("tenant_id", tenant.id).order("created_at"),
    svc.from("campaigns").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    getUsage(tenant.id),
  ]);

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <a href={`/o/${params.slug}/campaigns?tab=triggers`} className={`px-4 py-2 rounded-xl font-semibold text-sm ${tab === "triggers" ? "bg-ink-900 text-white" : "bg-stone-100"}`}>⚡ Always-on triggers</a>
        <a href={`/o/${params.slug}/campaigns?tab=broadcast`} className={`px-4 py-2 rounded-xl font-semibold text-sm ${tab === "broadcast" ? "bg-ink-900 text-white" : "bg-stone-100"}`}>📣 One-time broadcasts</a>
      </div>

      <div className="card mb-6">
        <h3 className="font-bold mb-2">Monthly usage</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="flex justify-between mb-1"><span>📱 SMS</span><b>{usage.smsUsed} / {usage.smsLimit} used</b></div>
            <div className="h-2 bg-stone-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (usage.smsUsed / usage.smsLimit) * 100)}%` }} /></div>
            <p className="text-stone-400 text-xs mt-1">{usage.smsLeft} left · counts every SMS sent</p>
          </div>
          <div>
            <div className="flex justify-between mb-1"><span>✉️ Email</span><b>{usage.emailUsed} / {usage.emailLimit} used</b></div>
            <div className="h-2 bg-stone-100 rounded-full"><div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (usage.emailUsed / usage.emailLimit) * 100)}%` }} /></div>
            <p className="text-stone-400 text-xs mt-1">{usage.emailLeft} left</p>
          </div>
        </div>
        <p className="text-xs text-stone-400 mt-3">Guardrails: only customers with valid consent get messages · max 1 marketing SMS per customer per week · every message counts against these limits.</p>
      </div>

      {tab === "triggers" && (
        <div>
          <p className="text-ink-500 mb-4 text-sm">Create a rule once — it runs automatically for every customer. Use <code className="bg-stone-100 px-1 rounded">{"{{name}}"}</code> and <code className="bg-stone-100 px-1 rounded">{"{{business}}"}</code> in messages.</p>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {(rules ?? []).map((r: any) => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start mb-2">
                  <div><b>{TRIGGER_LABELS[r.trigger_type]?.[0]}</b> <span className="text-xs bg-stone-100 rounded-full px-2 py-0.5 ml-1">{r.channel.toUpperCase()}</span></div>
                  <span className={`text-xs font-bold ${r.enabled ? "text-green-600" : "text-stone-400"}`}>{r.enabled ? "● ON" : "○ OFF"}</span>
                </div>
                <p className="text-sm text-ink-500 mb-3 whitespace-pre-wrap">{r.message_template}</p>
                <div className="flex gap-2">
                  <form action={saveTriggerRule}>
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="trigger_type" value={r.trigger_type} />
                    <input type="hidden" name="channel" value={r.channel} />
                    <input type="hidden" name="message_template" value={r.message_template} />
                    <input type="hidden" name="enabled" value={r.enabled ? "" : "on"} />
                    <button className="btn-secondary text-xs !py-1.5">{r.enabled ? "Turn off" : "Turn on"}</button>
                  </form>
                  <form action={deleteTriggerRule}>
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-red-600 px-2 py-1.5">Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="font-bold mb-3">Add a new trigger rule</h3>
            <form action={saveTriggerRule} className="space-y-3">
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="enabled" value="on" />
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Trigger</label>
                  <select name="trigger_type" className="input">
                    {Object.entries(TRIGGER_LABELS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
                  </select></div>
                <div><label className="label">Channel</label>
                  <select name="channel" className="input"><option value="sms">SMS</option><option value="email">Email</option></select></div>
              </div>
              <div><label className="label">Message</label>
                <textarea name="message_template" className="input" rows={3} required placeholder="Hi {{name}}! You're 1 stamp away from a free treat at {{business}} 🎉" /></div>
              <button className="btn-primary">Create trigger</button>
            </form>
          </div>
        </div>
      )}

      {tab === "broadcast" && (
        <div>
          <div className="card mb-6">
            <h3 className="font-bold mb-3">New broadcast</h3>
            <form action={createCampaign} className="space-y-3">
              <input type="hidden" name="slug" value={params.slug} />
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label">Name</label><input name="name" className="input" required placeholder="Weekend special" /></div>
                <div><label className="label">Channel</label><select name="channel" className="input"><option value="sms">SMS</option><option value="email">Email</option></select></div>
                <div><label className="label">Audience</label>
                  <select name="audience" className="input">
                    <option value="all">All customers</option>
                    <option value="near_reward">Close to a reward</option>
                    <option value="lapsed_30">Haven't visited in 30 days</option>
                    <option value="birthday_month">Birthday this month</option>
                  </select></div>
              </div>
              <div><label className="label">Subject (email only)</label><input name="subject" className="input" placeholder="Something tasty this weekend" /></div>
              <div><label className="label">Message</label><textarea name="body" className="input" rows={4} required placeholder="Hi {{name}}! ..." /></div>
              <button className="btn-primary">Save as draft</button>
            </form>
          </div>
          <div className="space-y-3">
            {(campaigns ?? []).map((c: any) => (
              <div key={c.id} className="card flex flex-wrap justify-between items-center gap-3">
                <div>
                  <b>{c.name}</b> <span className="text-xs bg-stone-100 rounded-full px-2 py-0.5 ml-1">{c.channel.toUpperCase()}</span>
                  <span className="text-xs bg-stone-100 rounded-full px-2 py-0.5 ml-1">{c.audience.replace("_", " ")}</span>
                  <p className="text-sm text-ink-500 mt-1 line-clamp-2">{c.body}</p>
                  <p className="text-xs text-stone-400 mt-1">Status: <b>{c.status}</b>{c.sent_at ? ` · sent ${new Date(c.sent_at).toLocaleString()}` : ""}</p>
                </div>
                {c.status === "draft" && (
                  <form action={sendCampaign}>
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="campaign_id" value={c.id} />
                    <button className="btn-primary text-sm">Send now</button>
                  </form>
                )}
              </div>
            ))}
            {(!campaigns || campaigns.length === 0) && <p className="text-ink-500 text-sm">No broadcasts yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
