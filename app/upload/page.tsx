// app/upload/page.tsx
'use client';
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = { plz?:string, strasse?:string, hausnummer?:string, stiege?:string, tuer?:string, raw:string };

export default function Upload() {
  const sb = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [matched, setMatched] = useState<{row:Row, objectid:number|null, adresse?:string}[]>([]);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [busy, setBusy] = useState(false);

  function parseCSV(text: string): Row[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    // Header erkennen
    const headerCols = lines[0].toLowerCase().split(/[,;\t]/).map(s => s.trim());
    const knownCols = ["plz","strasse","straße","hausnummer","hausnr","stiege","tuer","tür","türnummer"];
    const hasHeader = headerCols.some(c => knownCols.includes(c));
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
    
    return dataLines.map(line => {
      const parts = line.split(sep).map(s => s.trim().replace(/^["']|["']$/g, ""));
      if (hasHeader) {
        const r: Row = { raw: line };
        headerCols.forEach((c, i) => {
          if (c === "plz") r.plz = parts[i];
          else if (c === "strasse" || c === "straße") r.strasse = parts[i];
          else if (c === "hausnummer" || c === "hausnr") r.hausnummer = parts[i];
          else if (c === "stiege") r.stiege = parts[i];
          else if (c === "tuer" || c === "tür" || c === "türnummer") r.tuer = parts[i];
        });
        return r;
      } else {
        // Annahme-Reihenfolge: plz, strasse, hausnummer, stiege, tuer
        return {
          plz: parts[0], strasse: parts[1], hausnummer: parts[2],
          stiege: parts[3], tuer: parts[4], raw: line
        };
      }
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    
    // Matchen gegen gemeindebau
    const matches = await Promise.all(parsed.map(async row => {
      if (!row.strasse || !row.hausnummer) return { row, objectid:null };
      const adresse = `${row.strasse} ${row.hausnummer}`;
      const { data } = await sb.from("gemeindebau")
        .select("objectid,adresse,plz")
        .ilike("adresse", `${row.strasse}%${row.hausnummer}%`)
        .limit(1);
      return { row, objectid: data?.[0]?.objectid ?? null, adresse: data?.[0]?.adresse };
    }));
    setMatched(matches);
  }

  async function startAll() {
    setBusy(true);
    const userId = (await sb.auth.getUser()).data.user!.id;
    const session = (await sb.auth.getSession()).data.session!;
    
    // Bulk-Job anlegen mit allen Inputs
    const bulkInput = matched.map(m => ({
      objectid: m.objectid,
      hausnummer: m.row.hausnummer,
      stiege: m.row.stiege || null,
      tuernr: m.row.tuer || null,
      raw_input: m.row.raw,
    }));
    const { data: job } = await sb.from("query_job").insert({
      user_id: userId,
      scope: "bulk",
      bulk_input: bulkInput,
      force_refresh: forceRefresh,
      is_async: true,
    }).select().single();
    
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crawl`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ job_id: job!.id }),
    });
    router.push(`/jobs/${job!.id}`);
  }

  const okCount = matched.filter(m => m.objectid).length;
  const warnCount = matched.length - okCount;

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <Link href="/" className="text-sm text-blue-600">← Zurück</Link>
      <h1 className="text-xl font-bold">CSV/XLSX hochladen</h1>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm">Erwartete Spalten: <code>plz, strasse, hausnummer, stiege, tuer</code> (Header erlaubt). 
        Leere Stiege/Tür = ganzer Bau bzw. ganze Stiege.</p>
        <input type="file" accept=".csv,.xlsx,.txt" onChange={onFile}
          className="block w-full text-sm" />
        <pre className="text-xs bg-slate-50 p-2 rounded">
plz,strasse,hausnummer,stiege,tuer
1110,Simmeringer Hauptstraße,190-192,13,
1030,Schimmelgasse,23,,
1100,Sandleitengasse,37,,</pre>
      </div>

      {matched.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">{matched.length} Zeilen geladen · 
              <span className="text-green-700 ml-2">✓ {okCount} Gemeindebau</span>
              {warnCount > 0 && <span className="text-amber-700 ml-2">⚠ {warnCount} unklar</span>}
            </span>
          </div>
          <div className="overflow-x-auto max-h-72 border rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr><th className="p-1.5 text-left">PLZ</th><th>Straße</th><th>Hnr</th><th>Stg</th><th>Tür</th><th>Match</th></tr>
              </thead>
              <tbody>
                {matched.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">{m.row.plz}</td>
                    <td>{m.row.strasse}</td>
                    <td>{m.row.hausnummer}</td>
                    <td>{m.row.stiege}</td>
                    <td>{m.row.tuer}</td>
                    <td>{m.objectid ? <span className="text-green-700">✓ {m.adresse}</span> : <span className="text-amber-700">⚠ kein Match</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forceRefresh}
              onChange={e => setForceRefresh(e.target.checked)}/> Frisch abrufen
          </label>
          <button onClick={startAll} disabled={busy}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {busy ? "Starte …" : `Bulk-Abfrage starten (${matched.length} Zeilen)`}
          </button>
        </div>
      )}
    </main>
  );
}
