// app/auth/callback/route.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { notifyAdminNewUser } from "@/lib/email";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // WICHTIG: Erst Redirect-Response erstellen, dann Cookies darauf setzen.
  const response = NextResponse.redirect(`${origin}${next}`);

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error, data } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Neuer User? Profile sollte vom Trigger automatisch existieren.
  // Wenn Admin noch nicht benachrichtigt wurde → Email schicken.
  const userId = data.user?.id;
  if (userId) {
    const { data: profile } = await sb
      .from("profiles")
      .select("approved, notified_at, approval_token, email")
      .eq("user_id", userId)
      .single();

    if (profile && !profile.approved && !profile.notified_at) {
      // Schicke Email an Admin (im Hintergrund, blockiert nicht)
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        request.headers.get("origin") ??
        origin;

      try {
        const result = await notifyAdminNewUser({
          userEmail: profile.email,
          userId,
          approvalToken: profile.approval_token,
          appUrl,
        });

        if (result.ok) {
          // notified_at setzen damit nicht bei jedem Login eine neue Mail rausgeht
          await sb.from("profiles").update({ notified_at: new Date().toISOString() }).eq("user_id", userId);
        } else {
          console.error("notifyAdminNewUser fehlgeschlagen:", result.error);
        }
      } catch (e) {
        console.error("notifyAdminNewUser Exception:", e);
      }
    }

    // Wenn nicht approved → direkt zur /pending-Seite
    if (profile && !profile.approved) {
      return NextResponse.redirect(`${origin}/pending`);
    }
  }

  return response;
}
