// app/login/page.tsx
'use client';
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const sb = createClient();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // URL-Fehler aus Auth-Callback anzeigen
  useEffect(() => {
    const e = searchParams.get("error");
    if (e) setErr(decodeURIComponent(e));
  }, [searchParams]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    setBusy(false);
    if (error) {
      // Häufige Fehler übersetzen
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit")) {
        setErr("Zu viele Mails in kurzer Zeit gesendet. Bitte etwa 60 Sekunden warten.");
      } else if (msg.includes("invalid email")) {
        setErr("Ungültige E-Mail-Adresse.");
      } else {
        setErr(error.message);
      }
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">FW-Gemeindebau Login</h1>
          <p className="text-xs text-slate-500 mt-1">
            Anmelden mit Magic Link – kein Passwort nötig.
          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                ✓ Link wurde an <b>{email}</b> geschickt.
              </p>
              <p className="text-xs text-green-700/80 mt-1">
                Im Mail-Postfach öffnen (auch Spam-Ordner prüfen).
              </p>
            </div>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2 text-sm font-medium">
              Andere E-Mail verwenden
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block text-sm">
              E-Mail
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="dein.name@beispiel.com"
                className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !email}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg py-2 font-medium transition">
              {busy ? "Sende Link …" : "Magic Link schicken"}
            </button>
            {err && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2">
                {err}
              </div>
            )}
          </form>
        )}

        <div className="border-t pt-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            <b>Erste Anmeldung?</b> Dein Account wird automatisch angelegt.
            Der Admin bekommt eine Mail und entscheidet meist innerhalb
            weniger Stunden über die Freischaltung.
          </p>
        </div>
      </div>
    </main>
  );
}
