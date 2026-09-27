import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const svc = createServiceSupabase();
    const { error } = await svc.from("tenants").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return NextResponse.json({ ok: true, service: "stamply", time: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
