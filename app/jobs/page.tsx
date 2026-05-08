import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function JobsList() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  // login removed — public access

  const { data: jobs } = await sb.from("query_job")
    .select("id,scope,status,created_at,objectid,hausnummer,stiege,tuernr,calls_done,tueren_found,gemeindebau(adresse)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="pb-4">
      <header className="hero-dark text-white px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-[10px] uppercase tracking-wider text-blue-300/80">Verlauf</div>
          <h1 className="text-xl font-bold">Letzte Abfragen</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 -mt-2">
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {(jobs ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              Noch keine Abfragen.
            </div>
          )}
          {(jobs ?? []).map((j: any) => (
            <Link key={j.id} href={`/jobs/${j.id}`}
              className="flex justify-between items-center p-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {j.gemeindebau?.adresse ?? `Job #${j.id}`}
                  {j.stiege ? ` · Stiege ${j.stiege}` : ""}
                  {j.tuernr ? ` · Tür ${j.tuernr}` : ""}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(j.created_at).toLocaleString("de-AT")} ·
                  {" "}{j.calls_done} Calls · {j.tueren_found} Türen
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                j.status === "done" ? "bg-green-100 text-green-700" :
                j.status === "running" ? "bg-blue-100 text-blue-700" :
                j.status === "error" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
              }`}>{j.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
