"use client";
import { useState } from "react";
import { awardVisitAction, redeemRewardAction } from "./actions";

export function AwardPanel({ slug, customerId, rewardMode }: { slug: string; customerId: string; rewardMode: string }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function award() {
    setBusy(true); setMsg(null);
    const key = `staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const r = await awardVisitAction(slug, customerId, Number(amount) || 0, key);
    setBusy(false);
    if (r.ok) {
      setAmount("");
      const unit = rewardMode === "visits" ? `${r.stamps} stamps` : `${r.points} points`;
      setMsg({ ok: true, text: r.rewardIssued ? `🎉 Reward earned: ${r.rewardIssued.label}!` : `✓ Stamped! Customer now has ${unit}.` });
    } else {
      setMsg({ ok: false, text: r.error ?? "Something went wrong." });
    }
  }

  return (
    <div className="card">
      <h3 className="font-bold mb-3">Stamp this customer</h3>
      <div className="flex gap-2">
        <input className="input" type="number" min={0} step="0.01" placeholder="Bill amount $ (optional)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn-primary whitespace-nowrap" disabled={busy} onClick={award}>{busy ? "…" : rewardMode === "visits" ? "＋ Stamp visit" : "＋ Add points"}</button>
      </div>
      {msg && <p className={`mt-3 text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      <p className="text-xs text-stone-400 mt-2">One tap = one visit. Double-taps within a minute are blocked automatically.</p>
    </div>
  );
}

export function RedeemButton({ slug, rewardId, label }: { slug: string; rewardId: string; label: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  async function redeem() {
    if (!confirm(`Redeem "${label}" now?`)) return;
    const r = await redeemRewardAction(slug, rewardId);
    if (r.ok) setDone(true); else setErr(r.error ?? "Failed");
  }
  if (done) return <span className="text-green-600 font-semibold text-sm">✓ Redeemed</span>;
  return (
    <span>
      <button onClick={redeem} className="btn-primary text-xs !py-1.5">Redeem</button>
      {err && <span className="text-red-600 text-xs ml-2">{err}</span>}
    </span>
  );
}
