// app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export default async function Home() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // KPIs holen
  const { data: kpi } = await sb.from("bezirks_kpis").select("*");
  const totalBauten = kpi?.reduce((s, r) => s + (r.bauten ?? 0), 0) ?? 0;
  const totalWohn   = kpi?.reduce((s, r) => s + Number(r.wohnungen_register ?? 0), 0) ?? 0;
  const totalAbgef  = kpi?.reduce((s, r) => s + Number(r.tueren_api ?? 0), 0) ?? 0;

  // Letzte Jobs
  const { data: jobs } = await sb.from("query_job")
    .select("id,scope,status,created_at,objectid,hausnummer,stiege,tuernr,calls_done,tueren_found")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">FW-Gemeindebau</h1>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-slate-500">Logout</button>
        </form>
      </header>

      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Bestand</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold">{totalBauten.toLocaleString("de-AT")}</div>
            <div className="text-xs text-slate-500">Gemeindebauten</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{totalWohn.toLocaleString("de-AT")}</div>
            <div className="text-xs text-slate-500">Wohnungen total</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{totalAbgef.toLocaleString("de-AT")}</div>
            <div className="text-xs text-slate-500">Türen abgefragt</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/abfrage" className="bg-blue-600 text-white rounded-xl p-5 text-center font-semibold shadow-sm">
          + Neue Abfrage
        </Link>
        <Link href="/upload" className="bg-emerald-600 text-white rounded-xl p-5 text-center font-semibold shadow-sm">
          📁 CSV/XLSX
        </Link>
        <Link href="/jobs" className="bg-white border rounded-xl p-5 text-center font-semibold">
          📜 Letzte Abfragen
        </Link>
        <Link href="/daten" className="bg-white border rounded-xl p-5 text-center font-semibold">
          🔍 Daten durchsuchen
        </Link>
      </section>

      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Letzte Jobs</h2>
        {(!jobs || jobs.length === 0) ? (
          <p className="text-sm text-slate-500">Noch keine Abfragen.</p>
        ) : (
          <ul className="divide-y">
            {jobs.map(j => (
              <li key={j.id} className="py-2 flex justify-between items-center text-sm">
                <Link href={`/jobs/${j.id}`} className="flex-1">
                  <div className="font-medium">{j.scope} #{j.id}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(j.created_at!).toLocaleString("de-AT")}
                  </div>
                </Link>
                <span className={`text-xs px-2 py-1 rounded ${
                  j.status === "done" ? "bg-green-100 text-green-700" :
                  j.status === "running" ? "bg-blue-100 text-blue-700" :
                  j.status === "error" ? "bg-red-100 text-red-700" :
                  "bg-slate-100 text-slate-700"
                }`}>{j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
