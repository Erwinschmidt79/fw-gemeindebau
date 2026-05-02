// app/auth/callback/route.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    // Kein Code in der URL: zurück zum Login mit Fehler-Hinweis
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // WICHTIG: Erst die Redirect-Response erstellen, dann Cookies darauf setzen.
  // Sonst gehen die Auth-Cookies verloren und Middleware sieht keinen User.
  const response = NextResponse.redirect(`${origin}${next}`);

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    // Token bereits eingelöst (häufig bei Mail-Preview-Fetchern, die den
    // Link automatisch besuchen) oder abgelaufen → zurück zum Login.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return response;
}
