// app/admin/users/page.tsx
// Übersicht aller User für den Admin
'use client';
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type Profile = {
  user_id: string;
  email: string;
  full_name: string | null;
  approved: boolean;
  is_admin: boolean;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const sb = createClient();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setProfiles(data as Profile[]);
  }

  useEffect(() => { load(); }, []);

  async function setApproval(userId: string, approved: boolean) {
    setBusy(userId);
    const updates: any = approved
      ? { approved: true, approved_at: new Date().toISOString(), rejected_at: null }
      : { approved: false, rejected_at: new Date().toISOString() };
    const { error } = await sb.from("profiles").update(updates).eq("user_id", userId);
    if (error) setError(error.message);
    else await load();
    setBusy(null);
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="hero-dark text-white -mx-4 -mt-4 px-4 py-4 mb-4">
        <Link href="/" className="text-blue-300/80 text-xs">← Zur Karte</Link>
        <h1 className="text-xl font-bold mt-1">Nutzer-Verwaltung</h1>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Angelegt</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const status = p.is_admin ? "Admin"
                          : p.approved ? "Aktiv"
                          : p.rejected_at ? "Abgelehnt"
                          : "Wartet";
              const cls = p.is_admin ? "bg-blue-100 text-blue-700"
                       : p.approved ? "bg-green-100 text-green-700"
                       : p.rejected_at ? "bg-red-100 text-red-700"
                       : "bg-amber-100 text-amber-700";
              return (
                <tr key={p.user_id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.email}</div>
                    {p.full_name && <div className="text-[11px] text-slate-500">{p.full_name}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">
                    {new Date(p.created_at).toLocaleDateString("de-AT")}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!p.is_admin && (
                      <>
                        {p.approved ? (
                          <button onClick={() => setApproval(p.user_id, false)}
                            disabled={busy === p.user_id}
                            className="text-[11px] text-red-600 hover:underline disabled:opacity-40">
                            sperren
                          </button>
                        ) : (
                          <button onClick={() => setApproval(p.user_id, true)}
                            disabled={busy === p.user_id}
                            className="text-[11px] text-green-700 hover:underline disabled:opacity-40">
                            freischalten
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {profiles.filter(p => !p.approved && !p.rejected_at && !p.is_admin).length === 0 && (
        <p className="text-xs text-slate-500 mt-4 text-center">
          Keine offenen Anträge.
        </p>
      )}
    </div>
  );
}

