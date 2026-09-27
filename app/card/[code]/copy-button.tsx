"use client";
import { useState } from "react";

// Small copy-to-clipboard button. Shows "Copied!" briefly after tapping.
export default function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard unavailable (older browsers) — still show feedback.
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={className ?? "text-xs underline underline-offset-2 opacity-80 hover:opacity-100"}
      aria-label={`Copy ${text}`}
    >
      {done ? (
        "Copied!"
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline", verticalAlign: "-1px" }}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
