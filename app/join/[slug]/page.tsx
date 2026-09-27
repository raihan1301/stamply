import { getTenantBySlug } from "@/lib/auth";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import JoinForm from "./join-form";

// Always show the current program (owner may change it anytime).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JoinPage({ params, searchParams }: { params: { slug: string }; searchParams: { ref?: string } }) {
  headers(); // guarantee per-request rendering
  const tenant = await getTenantBySlug(params.slug);
  if (!tenant) notFound();
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center font-black text-xl text-white">S</span>
          <h1 className="text-xl font-bold">{tenant.name} rewards</h1>
        </div>
        <p className="text-ink-500 mb-6 text-sm capitalize">
          {tenant.business_type} · {tenant.city} · Earn {tenant.reward_mode === "visits" ? `a stamp each visit — ${tenant.stamp_threshold} stamps = ${tenant.reward_label}` : `points on every dollar — ${tenant.points_threshold} points = ${tenant.reward_label}`}
        </p>
        <JoinForm slug={params.slug} tenantName={tenant.name} ref={searchParams.ref} />
      </div>
    </div>
  );
}
