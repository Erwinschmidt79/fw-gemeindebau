// app/auth/signout/route.ts
import { createServerSupabase } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST() {
  const sb = await createServerSupabase();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", "http://localhost"), 303);
}
