import { createServiceSupabase } from "@/lib/supabase";
import { hasConsent } from "@/lib/campaigns";
import { notFound } from "next/navigation";
import { updatePreferences } from "./actions";
import CopyButton from "./copy-button";

// A loyalty card must always show live data (a customer refreshes right after
// staff stamp them), so never statically prerender this route.
export const dynamic = "force-dynamic";

// Wallet card — design B.
// Top: business logo + name / referral code. Middle: reward badge + progress
// (stamps, points, or the gold REWARD READY panel). Bottom: customer name.

const DEFAULT_BRAND = "#1e4d3b";

function safeBrand(raw: any): string {
  return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : DEFAULT_BRAND;
}

// Darken/lighten a #rrggbb color by amt (-255..255).
function shade(hex: string, amt: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// White text on dark brand colors, dark text on light ones.
function onBrand(hex: string): string {
  const num = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (num >> 16) + 0.587 * ((num >> 8) & 0xff) + 0.114 * (num & 0xff)) / 255;
  return lum > 0.6 ? "#1c1917" : "#ffffff";
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "S") + (words[1]?.[0] ?? "")).toUpperCase();
}

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

  const brand = safeBrand(tenant.brand_color);
  const brandDark = shade(brand, -45);
  const ink = onBrand(brand);
  const inkSoft = ink === "#ffffff" ? "rgba(255,255,255,.75)" : "rgba(28,25,23,.7)";
  const gold = "#f2b705";

  const prog = customer.customer_programs;
  const isVisits = tenant.reward_mode === "visits";
  const max = isVisits ? tenant.stamp_threshold : tenant.points_threshold;
  const cur = isVisits ? prog?.stamps ?? 0 : prog?.points ?? 0;
  const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
  const issued = (rewards ?? []).filter((r: any) => r.status === "issued");
  const latestReward = issued[0];
  const joinLink = `/join/${tenant.slug}?ref=${customer.referral_code}`;

  const terms = isVisits
    ? `Earn 1 stamp every visit. Collect ${max} stamps to earn: ${tenant.reward_label}. A new card starts after each reward.`
    : `Earn ${tenant.points_per_dollar} point${Number(tenant.points_per_dollar) === 1 ? "" : "s"} per $1 spent. Collect ${Number(max).toLocaleString("en-CA")} points to earn: ${tenant.reward_label}. A new card starts after each reward.`;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* ============ THE CARD ============ */}
      <div
        className="rounded-3xl p-5 mb-4 shadow-xl"
        style={{ background: `linear-gradient(160deg, ${brand}, ${brandDark})`, color: ink }}
      >
        {/* Header: logo + name | referral code */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={`${tenant.name} logo`} className="w-11 h-11 rounded-full object-cover bg-white/20" />
            ) : (
              <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm" style={{ background: gold, color: "#123324" }}>
                {initials(tenant.name)}
              </div>
            )}
            <div>
              <div className="font-bold leading-tight">{tenant.name}</div>
              <div className="text-[11px]" style={{ color: inkSoft }}>Loyalty card</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] tracking-[0.15em]" style={{ color: inkSoft }}>REFER FRIENDS</div>
            <div className="font-bold tracking-widest text-sm">
              {customer.referral_code} <CopyButton text={customer.referral_code} />
            </div>
          </div>
        </div>

        {/* Reward badge */}
        <div
          className="mt-4 rounded-xl px-3 py-2 text-[13px] font-bold"
          style={{ background: "rgba(242,183,5,.16)", border: `1px solid ${gold}88`, color: gold }}
        >
          REWARD · {tenant.reward_label}
        </div>

        {/* Middle: earned > collecting */}
        {latestReward ? (
          <div className="mt-3 rounded-2xl p-4 text-center" style={{ background: `linear-gradient(160deg, ${gold}, #d99a06)`, color: "#123324" }}>
            <div className="font-extrabold tracking-widest text-sm">REWARD READY</div>
            <div className="font-bold mt-1">{latestReward.label}</div>
            <div className="text-xs mt-1 opacity-80">Show this to your server</div>
            {latestReward.verification_code ? (
              <div className="font-extrabold tracking-[0.25em] mt-2 text-base">CODE · {latestReward.verification_code}</div>
            ) : null}
            {issued.length > 1 && <div className="text-xs mt-1 opacity-75">+{issued.length - 1} more reward{issued.length > 2 ? "s" : ""} waiting</div>}
          </div>
        ) : isVisits ? (
          <div className="text-center mt-4">
            <div className="text-[26px] tracking-[0.2em]" style={{ color: gold }}>
              {"★".repeat(cur)}
              <span style={{ color: ink === "#ffffff" ? "rgba(255,255,255,.25)" : "rgba(28,25,23,.2)" }}>{"☆".repeat(Math.max(0, max - cur))}</span>
            </div>
            <div className="text-[13px] mt-2" style={{ color: inkSoft }}>
              {cur} of {max} visits · <b style={{ color: ink }}>{max - cur} to go!</b>
            </div>
            <div className="h-1.5 rounded-full mt-2" style={{ background: "rgba(127,127,127,.25)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: gold }} />
            </div>
          </div>
        ) : (
          <div className="text-center mt-4">
            <div className="font-extrabold" style={{ color: gold, fontSize: "32px" }}>
              {cur.toLocaleString("en-CA")} <span className="text-base font-semibold">pts</span>
            </div>
            <div className="text-[13px] mt-1" style={{ color: inkSoft }}>
              <b style={{ color: ink }}>{(max - cur).toLocaleString("en-CA")} pts</b> to {tenant.reward_label}
            </div>
            <div className="h-1.5 rounded-full mt-2" style={{ background: "rgba(127,127,127,.25)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: gold }} />
            </div>
          </div>
        )}

        {/* New-cycle progress while holding an unredeemed reward */}
        {latestReward && cur > 0 && (
          <div className="text-center text-xs mt-3" style={{ color: inkSoft }}>
            New card: {isVisits ? `${cur} of ${max} stamps` : `${cur.toLocaleString("en-CA")} of ${Number(max).toLocaleString("en-CA")} pts`}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-end mt-4">
          <div className="font-semibold text-[13px]">{customer.name}</div>
          <div className="text-[10px]" style={{ color: inkSoft }}>Powered by SmartOps</div>
        </div>
      </div>

      {/* ============ INFO ============ */}
      <div className="card mb-4">
        <h3 className="font-bold mb-2">About this card</h3>
        <p className="text-sm text-ink-500 mb-2">{terms}</p>
        {tenant.address && <p className="text-sm text-ink-500">📍 {tenant.address}</p>}
        {tenant.hours && <p className="text-sm text-ink-500">🕐 {tenant.hours}</p>}
        <a href="#preferences" className="text-sm text-brand-600 underline underline-offset-2">Manage preferences / unsubscribe</a>
      </div>

      {/* ============ REFER ============ */}
      <div className="card mb-4">
        <h3 className="font-bold mb-2">Invite friends</h3>
        <p className="text-sm text-ink-500 mb-2">Share your code <b className="tracking-widest">{customer.referral_code}</b> <CopyButton text={customer.referral_code} className="text-xs text-brand-600 underline underline-offset-2" /> — you both get a bonus stamp when they join.</p>
        <code className="block bg-stone-100 rounded-xl p-3 text-sm break-all">{joinLink}</code>
      </div>

      {/* ============ PREFERENCES ============ */}
      <div className="card" id="preferences">
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
