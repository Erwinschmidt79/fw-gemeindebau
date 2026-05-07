// app/admin/approve/route.ts
// Wird via Email-Link aufgerufen: ?token=<approval_token>&action=approve|reject
// Token-basiert, kein Login nötig (deshalb in PUBLIC_PATHS der Middleware)

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { notifyUserApproved } from "@/lib/email";

export const dynamic = "force-dynamic";

function htmlPage(title: string, message: string, color: string, emoji: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); padding: 32px; max-width: 420px; text-align: center; }
    .emoji { font-size: 48px; }
    h1 { color: ${color}; margin: 12px 0 8px }
    p { color: #475569; font-size: 14px; line-height: 1.5; margin: 8px 0 0 }
    a { display: inline-block; margin-top: 24px; background: #003a78; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px }
  </style>
</head><body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Zur App</a>
  </div>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");
  const action = searchParams.get("action") ?? "approve";

  if (!token) {
    return htmlPage("Ungültiger Link", "Der Link enthält keinen Token.", "#dc2626", "❌");
  }

  // Service-Role-Key für Admin-Zugriff (umgeht RLS) - nur in Server Code!
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Profil mit dem Token finden
  const { data: profile, error: lookupErr } = await sb
    .from("profiles")
    .select("user_id, email, approved, rejected_at, approval_token")
    .eq("approval_token", token)
    .single();

  if (lookupErr || !profile) {
    return htmlPage(
      "Token ungültig oder abgelaufen",
      "Dieser Link wurde bereits verwendet oder ist nicht gültig.",
      "#dc2626", "❌"
    );
  }

  // Bereits bearbeitet?
  if (profile.approved) {
    return htmlPage(
      "Bereits freigeschaltet",
      `${profile.email} ist bereits zugelassen. Keine weitere Aktion nötig.`,
      "#16a34a", "✓"
    );
  }
  if (profile.rejected_at) {
    return htmlPage(
      "Bereits abgelehnt",
      `${profile.email} wurde bereits abgelehnt.`,
      "#475569", "🚫"
    );
  }

  if (action === "reject") {
    // Token "verbrauchen": neuen erzeugen, damit der Approve-Link aus derselben Mail nicht mehr funktioniert
    const newToken = crypto.randomUUID();
    await sb.from("profiles").update({
      rejected_at: new Date().toISOString(),
      approval_token: newToken,
    }).eq("user_id", profile.user_id);

    return htmlPage(
      "Antrag abgelehnt",
      `${profile.email} wurde abgelehnt und kann sich nicht einloggen.`,
      "#475569", "🚫"
    );
  }

  // Approve
  const newToken = crypto.randomUUID();
  const { error: updErr } = await sb.from("profiles").update({
    approved: true,
    approved_at: new Date().toISOString(),
    approval_token: newToken,  // Token verbrauchen
  }).eq("user_id", profile.user_id);

  if (updErr) {
    return htmlPage(
      "Fehler",
      "Update fehlgeschlagen: " + updErr.message,
      "#dc2626", "❌"
    );
  }

  // User benachrichtigen
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  notifyUserApproved({ userEmail: profile.email, appUrl }).catch(e =>
    console.error("notifyUserApproved failed:", e)
  );

  return htmlPage(
    "✓ Freigeschaltet",
    `${profile.email} kann sich jetzt einloggen und wird per Mail informiert.`,
    "#16a34a", "✓"
  );
}

