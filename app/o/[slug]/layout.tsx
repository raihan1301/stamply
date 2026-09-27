import { redirect, notFound } from "next/navigation";
import { requireUser, membershipFor, getTenantBySlug } from "@/lib/auth";
import { getUsage } from "@/lib/campaigns";

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const user = await requireUser();
  const tenant = await getTenantBySlug(params.slug);
  if (!tenant) notFound();
  const membership = membershipFor(user, params.slug);
  if (!membership || !["platform_admin", "owner", "manager"].includes(membership.role)) redirect("/login");

  const usage = await getUsage(tenant.id);
  const nav = [
    ["dashboard", "Dashboard"],
    ["customers", "Customers"],
    ["program", "Reward program"],
    ["campaigns", "Campaigns"],
    ["reports", "Reports"],
    ["audit", "Audit log"],
    ["settings", "Settings"],
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-ink-500 capitalize">{tenant.business_type} · {tenant.city}</p>
        </div>
        <div className="card !p-3 flex items-center gap-4 text-sm">
          <span title="SMS usage this month">📱 <b>{usage.smsUsed}</b><span className="text-stone-400">/{usage.smsLimit}</span></span>
          <span title="Email usage this month">✉️ <b>{usage.emailUsed}</b><span className="text-stone-400">/{usage.emailLimit}</span></span>
        </div>
      </div>
      {tenant.marketing_paused && <p className="bg-amber-100 text-amber-800 text-sm rounded-xl px-4 py-2 mb-4">⚠️ Marketing is paused for this business by the platform admin.</p>}
      <nav className="flex gap-1 flex-wrap mb-6 border-b border-stone-200">
        {nav.map(([key, label]) => (
          <a key={key} href={`/o/${params.slug}/${key}`} className="px-4 py-2.5 text-sm font-semibold text-ink-500 hover:text-ink-900 border-b-2 border-transparent hover:border-brand-500">{label}</a>
        ))}
      </nav>
      {children}
    </div>
  );
}
