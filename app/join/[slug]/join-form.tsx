"use client";
import { useState } from "react";
import { enrollCustomer } from "./actions";

export default function JoinForm({ slug, tenantName, ref }: { slug: string; tenantName: string; ref?: string }) {
  const [done, setDone] = useState<{ referralCode: string; tenantName: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await enrollCustomer(new FormData(e.currentTarget));
      setDone(r);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-xl font-bold mb-2">You're in, welcome to {done.tenantName}!</h2>
        <p className="text-ink-500 mb-4">Show this card at every visit to collect stamps.</p>
        <a href={`/card/${done.referralCode}`} className="btn-primary inline-block">Open my stamp card →</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {ref && <input type="hidden" name="ref" value={ref} />}
      <div><label className="label">Your name</label><input name="name" className="input" required placeholder="Alex" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Phone</label><input name="phone" className="input" type="tel" placeholder="(519) 555-0100" /></div>
        <div><label className="label">Email</label><input name="email" className="input" type="email" placeholder="alex@mail.com" /></div>
      </div>
      <div><label className="label">Birthday (for a birthday treat 🎂)</label><input name="birthday" type="date" className="input" /></div>
      <div className="bg-stone-50 rounded-xl p-4 space-y-3 text-sm">
        <label className="flex gap-2 items-start">
          <input type="checkbox" name="sms_consent" className="mt-1" />
          <span>Yes, text me about rewards and offers from <b>{tenantName}</b>. Msg & data rates may apply. Reply STOP anytime to opt out.</span>
        </label>
        <label className="flex gap-2 items-start">
          <input type="checkbox" name="email_consent" className="mt-1" />
          <span>Yes, email me about rewards and offers from <b>{tenantName}</b>. Unsubscribe anytime.</span>
        </label>
        <p className="text-xs text-stone-400">We only message you about things you agree to here. Your info stays with {tenantName}.</p>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Joining…" : `Join ${tenantName} rewards`}</button>
    </form>
  );
}
