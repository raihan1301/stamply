"use client";
import { useState } from "react";
import { exportCustomersCsv } from "./actions";

export default function DownloadButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    const csv = await exportCustomersCsv(slug);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stamply-customers-${slug}.csv`;
    a.click();
    setBusy(false);
  }
  return <button onClick={download} disabled={busy} className="btn-secondary text-sm">{busy ? "Preparing…" : "Download customers CSV"}</button>;
}
