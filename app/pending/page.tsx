// app/pending/page.tsx
import { createServerSupabase } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Falls schon approved: weiter zur App
  const { data: profile } = await sb
    .from("profiles")
    .select("approved, email, rejected_at")
    .eq("user_id", user.id)
    .single();

  if (profile?.approved) redirect("/");

  const wasRejected = !!profile?.rejected_at;

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-6 space-y-4">
        {wasRejected ? (
          <>
            <div className="text-3xl">🚫</div>
            <h1 className="text-xl font-semibold">Zugriff abgelehnt</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Der Admin hat deinen Zugriffs-Antrag abgelehnt.
              Bei Fragen wende dich direkt an den Admin.
            </p>
          </>
        ) : (
          <>
            <div className="text-3xl">⏳</div>
            <h1 className="text-xl font-semibold">Warte auf Freischaltung</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Dein Account <b>{profile?.email ?? user.email}</b> wurde angelegt.
              Der Admin hat per Mail eine Anfrage bekommen und entscheidet
              meist innerhalb weniger Stunden.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sobald freigeschaltet, bekommst du eine Bestätigungs-Mail
              und kannst dich einloggen.
            </p>
          </>
        )}

        <form action="/auth/signout" method="post">
          <button type="submit"
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2 font-medium text-sm">
            Abmelden
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center">
          <Link href="/login" className="hover:underline">Zurück zur Login-Seite</Link>
        </p>
      </div>
    </main>
  );
}

