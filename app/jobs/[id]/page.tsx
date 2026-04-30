// app/jobs/[id]/page.tsx
'use client';
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Job = {
  id: number; status: string; scope: string; objectid: number | null;
  hausnummer: string | null; stiege: string | null; tuernr: string | null;
  calls_done: number; stiegen_found: number; tueren_found: number;
  created_at: string; started_at: string|null; finished_at: string|null;
  last_error: string|null;
};

type TuerRow = {
  tuer_id: number; tuernr: string; stiege: string;
  hausnummer: string; tuer_vstelle: string|null;
  strom: string|null; strom_zp: string|null; strom_smartmeter: string|null;
  gas: string|null; gas_zp: string|null;
  fernwaerme: string|null; fw_vertragsBeginn: string|null;
  internet: string|null; iptv: string|null; voip: string|null;
};

export default function JobDetail() {
  const sb = createClient();
  const params = useParams();
  const jobId = Number(params.id);
  const [job, setJob] = useState<Job|null>(null);
  const [rows, setRows] = useState<TuerRow[]>([]);
  const [filter, setFilter] = useState({strom:false, gas:false, fw:false});
  const [showExtras, setShowExtras] = useState(false);

  useEffect(() => {
    let interval: any;
    async function tick() {
      const { data } = await sb.from("query_job").select("*").eq("id", jobId).single();
      if (data) setJob(data as Job);
      // Tür-Daten lesen (für diesen Bau)
      if (data?.objectid) {
        let q = sb.from("tuer_uebersicht").select("*").eq("objectid", data.objectid);
        if (data.stiege) q = q.eq("stiege", data.stiege);
        if (data.tuernr) q = q.eq("tuernr", data.tuernr);
        const { data: t } = await q.order("stiege").order("tuernr");
        setRows((t ?? []) as TuerRow[]);
      }
    }
    tick();
    interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const filtered = rows.filter(r => {
    if (filter.strom && r.strom !== "JA") return false;
    if (filter.gas && r.gas !== "JA") return false;
    if (filter.fw && r.fernwaerme !== "JA") return false;
    return true;
  });

  function exportCSV() {
    const cols = ["stiege","tuernr","hausnummer","tuer_vstelle",
      "strom","strom_zp","strom_smartmeter","strom_tarif",
      "gas","gas_zp","gas_tarif",
      "fernwaerme","fw_vertragsBeginn","fw_nutzungsObjektId",
      "internet","iptv","voip","b2b_glasfaser"];
    const csv = [cols.join(","), ...filtered.map(r =>
      cols.map(c => JSON.stringify((r as any)[c] ?? "")).join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `job-${jobId}.csv`;
    a.click();
  }

  if (!job) return <main className="p-4">Lade…</main>;

  const statusColor = {
    pending: "bg-slate-100 text-slate-600",
    running: "bg-blue-100 text-blue-700",
    done:    "bg-green-100 text-green-700",
    error:   "bg-red-100 text-red-700",
  }[job.status] ?? "bg-slate-100";

  const summary = {
    strom: filtered.filter(r => r.strom === "JA").length,
    gas:   filtered.filter(r => r.gas === "JA").length,
    fw:    filtered.filter(r => r.fernwaerme === "JA").length,
  };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <Link href="/" className="text-sm text-blue-600">← Zurück</Link>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold">Job #{job.id}</h1>
            <div className="text-sm text-slate-600">
              {job.scope} · {job.hausnummer ?? "*"} / {job.stiege ?? "*"} / {job.tuernr ?? "*"}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{job.status}</span>
        </div>
        <div className="mt-3 text-sm grid grid-cols-3 gap-2">
          <div><span className="text-slate-500">Calls:</span> {job.calls_done}</div>
          <div><span className="text-slate-500">Stiegen:</span> {job.stiegen_found}</div>
          <div><span className="text-slate-500">Türen:</span> {job.tueren_found}</div>
        </div>
        {job.status === "running" && (
          <div className="mt-2">
            <div className="h-2 bg-slate-200 rounded overflow-hidden">
              <div className="h-full bg-blue-500 animate-pulse" style={{width:"60%"}}/>
            </div>
            <p className="text-xs text-slate-500 mt-1">Läuft … Seite aktualisiert sich automatisch</p>
          </div>
        )}
        {job.last_error && (
          <p className="mt-2 text-sm text-red-700">{job.last_error}</p>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-2xl font-bold">{summary.strom}</div><div className="text-xs">Strom JA</div></div>
            <div><div className="text-2xl font-bold">{summary.gas}</div><div className="text-xs">Gas JA</div></div>
            <div><div className="text-2xl font-bold">{summary.fw}</div><div className="text-xs">FW JA</div></div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 flex flex-wrap gap-2 items-center text-sm border-b">
          <span className="font-semibold">Filter:</span>
          <label><input type="checkbox" checked={filter.strom}
            onChange={e => setFilter({...filter, strom:e.target.checked})}/> nur Strom JA</label>
          <label><input type="checkbox" checked={filter.gas}
            onChange={e => setFilter({...filter, gas:e.target.checked})}/> nur Gas JA</label>
          <label><input type="checkbox" checked={filter.fw}
            onChange={e => setFilter({...filter, fw:e.target.checked})}/> nur FW JA</label>
          <span className="ml-auto flex gap-2">
            <button onClick={() => setShowExtras(!showExtras)}
              className="text-xs px-2 py-1 border rounded">
              {showExtras ? "Weniger Spalten" : "Mehr Spalten"}
            </button>
            <button onClick={exportCSV}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded">⬇ CSV</button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">Stg</th>
                <th className="px-2 py-2 text-left">Tür</th>
                <th className="px-2 py-2 text-left">Strom</th>
                <th className="px-2 py-2 text-left">Strom-Zähler</th>
                <th className="px-2 py-2 text-left">Gas</th>
                <th className="px-2 py-2 text-left">Gas-Zähler</th>
                <th className="px-2 py-2 text-left">FW</th>
                {showExtras && <>
                  <th className="px-2 py-2 text-left">FW-Vertrag</th>
                  <th className="px-2 py-2 text-left">Internet</th>
                  <th className="px-2 py-2 text-left">IPTV</th>
                  <th className="px-2 py-2 text-left">VoIP</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.tuer_id} className="border-t">
                  <td className="px-2 py-1.5">{r.stiege}</td>
                  <td className="px-2 py-1.5 font-medium">{r.tuernr}</td>
                  <td className="px-2 py-1.5">{badge(r.strom)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{(r.strom_zp ?? "").slice(-12)}</td>
                  <td className="px-2 py-1.5">{badge(r.gas)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{(r.gas_zp ?? "").slice(-12)}</td>
                  <td className="px-2 py-1.5">{badge(r.fernwaerme)}</td>
                  {showExtras && <>
                    <td className="px-2 py-1.5 text-xs">{r.fw_vertragsBeginn ?? ""}</td>
                    <td className="px-2 py-1.5">{badge(r.internet)}</td>
                    <td className="px-2 py-1.5">{badge(r.iptv)}</td>
                    <td className="px-2 py-1.5">{badge(r.voip)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-slate-500">Noch keine Daten oder alle Türen wurden ausgefiltert.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function badge(v: string|null) {
  if (!v) return <span className="text-slate-400">–</span>;
  const cls = v === "JA" ? "bg-green-100 text-green-700"
            : v === "NEIN" ? "bg-red-50 text-red-600"
            : "bg-slate-100 text-slate-600";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{v}</span>;
}
