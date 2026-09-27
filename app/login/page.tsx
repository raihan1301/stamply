"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { requestCardLinkAction } from "./actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Wrong email or password. Please try again."); setBusy(false); return; }
    router.push("/post-login");
    router.refresh();
  }

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setResendBusy(true); setResendMsg("");
    try {
      const { message } = await requestCardLinkAction(new FormData(e.target as HTMLFormElement));
      setResendMsg(message);
    } catch {
      setResendMsg("Something went wrong. Please try again.");
    }
    setResendBusy(false);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center font-black text-xl text-white">S</span>
          <h1 className="text-2xl font-bold">Welcome to Stamply</h1>
        </div>
        <p className="text-ink-500 mb-6">Sign in to your shop dashboard.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="text-xs text-stone-400 mt-6 text-center">
          Customers: you don't need to sign in — open your personal card link from your shop.
        </p>
        <div className="mt-6 pt-6 border-t border-stone-200">
          <h2 className="font-semibold mb-1">Lost your card link?</h2>
          <p className="text-sm text-ink-500 mb-3">
            Enter your phone number or email and we'll text or email your loyalty card link to you.
          </p>
          <form onSubmit={onResend} className="space-y-3">
            <input
              className="input"
              name="contact"
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Phone number or email"
              autoComplete="off"
            />
            <button className="btn-secondary w-full" disabled={resendBusy}>
              {resendBusy ? "Sending…" : "Text me my link"}
            </button>
          </form>
          {resendMsg && <p className="text-sm text-ink-500 mt-3">{resendMsg}</p>}
        </div>
      </div>
    </div>
  );
}
