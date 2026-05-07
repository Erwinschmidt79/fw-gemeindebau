import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Pfade die OHNE Login erreichbar sein müssen (Login + Auth-Callback + Admin-Approve via Email-Link)
const PUBLIC_PATHS = ["/login", "/admin/approve"];
const AUTH_PATH_PREFIX = "/auth/";

// Pfade die für eingeloggte aber NICHT freigegebene User erreichbar sind
const PENDING_OK_PATHS = ["/pending"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await sb.auth.getUser();
  const path = request.nextUrl.pathname;

  const isPublic =
    PUBLIC_PATHS.some(p => path === p || path.startsWith(p + "/")) ||
    path.startsWith(AUTH_PATH_PREFIX);

  // Nicht eingeloggt → /login (außer auf öffentlichen Pfaden)
  if (!user) {
    if (isPublic) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Eingeloggt: profile prüfen
  const { data: profile } = await sb
    .from("profiles")
    .select("approved, is_admin")
    .eq("user_id", user.id)
    .single();

  const approved = profile?.approved === true;
  const isAdmin  = profile?.is_admin === true;

  // /admin/* nur für Admins (außer /admin/approve – das ist via Email-Link nutzbar)
  if (path.startsWith("/admin") && !path.startsWith("/admin/approve")) {
    if (!isAdmin) {
      return NextResponse.redirect(new URL(approved ? "/" : "/pending", request.url));
    }
    return response;
  }

  // Eingeloggt aber NICHT approved → /pending
  if (!approved) {
    const onPendingOk =
      PENDING_OK_PATHS.some(p => path === p || path.startsWith(p + "/")) ||
      isPublic;
    if (!onPendingOk) {
      return NextResponse.redirect(new URL("/pending", request.url));
    }
    return response;
  }

  // Approved User: nicht auf /login bleiben (sonst confusing)
  if (path === "/login" || path === "/pending") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};

