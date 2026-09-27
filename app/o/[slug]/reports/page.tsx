import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import DownloadButton from "./download-button";

function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default async function ReportsPage({ params }: { params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  const m = membershipFor(user, params.slug);
  if (!tenant || !m) redirect("/login");
  const svc = createServiceSupabase();

  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [{ data: enroll }, { data: visits }, { data: msgs }, { data: campaigns }] = await Promise.all([
    svc.from("customers").select("created_at").eq("tenant_id", tenant.id).gte("created_at", monthAgo),
    svc.from("ledger_events").select("type, amount_cents, created_at").eq("tenant_id", tenant.id).gte("created_at", monthAgo),
    svc.from("messages").select("channel, status, created_at").eq("tenant_id", tenant.id).gte("created_at", monthAgo),
    svc.from("campaigns").select("id, name, channel, status, sent_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const visitCount = (visits ?? []).filter((v) => ["VISIT_AWARDED", "POINTS_AWARDED"].includes(v.type)).length;
  const spend = (visits ?? []).reduce((s, v) => s + (v.amount_cents ?? 0), 0);
  const smsSent = (msgs ?? []).filter((x) => x.channel === "sms" && x.status === "sent").length;
  const emailSent = (msgs ?? []).filter((x) => x.channel === "email" && x.status === "sent").length;
  const suppressed = (msgs ?? []).filter((x) => x.status === "suppressed").length;

  const stats = [
    ["New customers (30d)", String((enroll ?? []).length)],
    ["Visits (30d)", String(visitCount)],
    ["Spend tracked (30d)", money(spend)],
    ["SMS sent (30d)", String(smsSent)],
    ["Emails sent (30d)", String(emailSent)],
    ["Suppressed by guardrails", String(suppressed)],
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Reports — last 30 days</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {stats.map(([l, v]) => <div key={l} className="card"><p className="text-2xl font-bold">{v}</p><p className="text-sm text-ink-500">{l}</p></div>)}
      </div>
      <div className="card mb-6">
        <h3 className="font-bold mb-3">Campaign performance</h3>
        {(campaigns ?? []).map((c: any) => (
          <div key={c.id} className="flex justify-between text-sm py-2 border-b border-stone-100 last:border-0">
            <span>{c.name} <span className="text-stone-400">({c.channel})</span></span>
            <span className="text-ink-500">{c.status}{c.sent_at ? ` · ${new Date(c.sent_at).toLocaleDateString()}` : ""}</span>
          </div>
        ))}
        {(!campaigns || campaigns.length === 0) && <p className="text-sm text-ink-500">No campaigns yet.</p>}
      </div>
      <div className="card">
        <h3 className="font-bold mb-2">Export</h3>
        <p className="text-sm text-ink-500 mb-3">Download your full customer list as CSV.</p>
        <DownloadButton slug={params.slug} />
      </div>
    </div>
  );
}
