import { redirect } from "next/navigation";
import { getSessionUser, isPlatformAdmin } from "@/lib/auth";

export default async function PostLogin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isPlatformAdmin(user)) redirect("/admin");
  const owner = user.memberships.find((m) => ["owner", "manager"].includes(m.role) && m.tenant?.slug);
  if (owner?.tenant?.slug) redirect(`/o/${owner.tenant.slug}/dashboard`);
  const staff = user.memberships.find((m) => m.role === "staff" && m.tenant?.slug);
  if (staff?.tenant?.slug) redirect(`/staff?t=${staff.tenant.slug}`);
  redirect("/login");
}
