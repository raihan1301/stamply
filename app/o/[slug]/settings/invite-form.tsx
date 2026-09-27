"use client";
import { useState } from "react";
import { inviteStaff } from "./actions";

export default function InviteForm({ slug }: { slug: string }) {
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(""); setCreds(null);
    try {
      const r = await inviteStaff(new FormData(e.currentTarget));
      setCreds(r);
      e.currentTarget.reset();
    } catch (err: any) {
      setError(err?.message ?? "Invite failed.");
    }
    setBusy(false);
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-3">
        <input type="hidden" name="slug" value={slug} />
        <div><label className="label">Name</label><input name="name" className="input" required placeholder="Maya" /></div>
        <div><label className="label">Email</label><input name="email" type="email" className="input" required placeholder="maya@shop.com" /></div>
        <div><label className="label">Role</label>
          <select name="role" className="input"><option value="staff">Staff (stamps customers)</option><option value="manager">Manager (staff + fixes mistakes)</option></select></div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? "Inviting…" : "Invite"}</button></div>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {creds && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
          <p className="font-bold text-green-800 mb-1">✓ Staff account created — share this once:</p>
          <p>Email: <code className="bg-white px-1 rounded">{creds.email}</code></p>
          <p>Temporary password: <code className="bg-white px-1 rounded">{creds.password}</code></p>
        </div>
      )}
    </div>
  );
}
