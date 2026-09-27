"use server";
import { revalidatePath } from "next/cache";
import { createServiceSupabase } from "@/lib/supabase";
import { requireUser, membershipFor } from "@/lib/auth";

async function requireOwner(slug: string) {
  const u = await requireUser();
  const m = membershipFor(u, slug);
  if (!m || !["platform_admin", "owner"].includes(m.role)) throw new Error("Not allowed.");
  const svc = createServiceSupabase();
  const { data: tenant } = await svc.from("tenants").select("*").eq("slug", slug).single();
  if (!tenant) throw new Error("Business not found.");
  return { u, tenant };
}

export async function updateProgram(formData: FormData) {
  const slug = String(formData.get("slug"));
  const { u, tenant } = await requireOwner(slug);
  const svc = createServiceSupabase();
  const reward_mode = String(formData.get("reward_mode"));
  if (!["visits", "points"].includes(reward_mode)) throw new Error("Bad mode.");
  const reward_type = String(formData.get("reward_type"));
  await svc.from("tenants").update({
    reward_mode,
    stamp_threshold: Math.max(1, Number(formData.get("stamp_threshold") ?? 8)),
    points_per_dollar: Math.max(0.1, Number(formData.get("points_per_dollar") ?? 1)),
    points_threshold: Math.max(1, Number(formData.get("points_threshold") ?? 100)),
    bonus_stamp_min_spend_cents: formData.get("bonus_stamp_min_spend") ? Math.round(Number(formData.get("bonus_stamp_min_spend")) * 100) : null,
    reward_type: ["amount_off", "free_item"].includes(reward_type) ? reward_type : "free_item",
    reward_amount_cents: formData.get("reward_amount") ? Math.round(Number(formData.get("reward_amount")) * 100) : null,
    reward_label: String(formData.get("reward_label") ?? "Free item").slice(0, 80),
  }).eq("id", tenant.id);
  await svc.from("audit_events").insert({
    tenant_id: tenant.id, actor_user_id: u.id, action: "PROGRAM_UPDATED",
    target_type: "tenant", target_id: tenant.id, reason: `mode -> ${reward_mode}`,
  });
  revalidatePath(`/o/${slug}/program`);
}
