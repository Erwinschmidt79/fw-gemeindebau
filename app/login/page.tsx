// app/login/page.tsx
'use client';
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const sb = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined }
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">FW-Gemeindebau Login</h1>
        {sent ? (
          <p className="text-green-700 text-sm">
            ✓ Link wurde an <b>{email}</b> geschickt. Im Mail-Postfach öffnen.
          </p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block text-sm">
              E-Mail
              <input type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2" />
            </label>
            <button className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium">
              Magic Link schicken
            </button>
            {err && <p className="text-red-600 text-sm">{err}</p>}
          </form>
        )}
        <p className="text-xs text-slate-500">
          Bei der ersten Anmeldung wird der Account automatisch angelegt.
          Anschließend musst du vom Admin freigeschaltet werden.
        </p>
      </div>
    </main>
  );
}
