// app/daten/page.tsx
'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function Daten() {
  const sb = createClient();
  const [search, setSearch] = useState("");
  const [bezirk, setBezirk] = useState("");
  const [filter, setFilter] = useState<{strom:boolean,gas:boolean,fw:boolean}>({strom:false,gas:false,fw:false});
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = sb.from("tuer_uebersicht")
        .select("*", { count: "exact" })
        .limit(200);
      if (search) q = q.or(`adresse.ilike.%${search}%,hofname.ilike.%${search}%`);
      if (bezirk) q = q.eq("bezirk", parseInt(bezirk));
      if (filter.strom) q = q.eq("strom","JA");
      if (filter.gas)   q = q.eq("gas","JA");
      if (filter.fw)    q = q.eq("fernwaerme","JA");
      const { data, count } = await q;
      setRows(data ?? []);
      setCount(count ?? 0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, bezirk, filter]);

  function exportCSV() {
    const cols = ["bezirk","plz","adresse","stiege","tuernr",
      "strom","strom_zp","gas","gas_zp","fernwaerme","fw_vertragsBeginn"];
    const csv = [cols.join(","), ...rows.map(r =>
      cols.map(c => JSON.stringify(r[c] ?? "")).join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "tueren.csv"; a.click();
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <Link href="/" className="text-sm text-blue-600">← Zurück</Link>
      <h1 className="text-xl font-bold">Daten durchsuchen</h1>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Suche Adresse / Hofname"
            className="border rounded-lg px-3 py-2 text-sm" />
          <select value={bezirk} onChange={e => setBezirk(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Alle Bezirke</option>
            {Array.from({length:23},(_,i)=>i+1).map(n =>
              <option key={n} value={n}>Bezirk {n}</option>)}
          </select>
          <div className="flex items-center gap-3 text-sm">
            <label><input type="checkbox" checked={filter.strom}
              onChange={e => setFilter({...filter,strom:e.target.checked})}/> Strom</label>
            <label><input type="checkbox" checked={filter.gas}
              onChange={e => setFilter({...filter,gas:e.target.checked})}/> Gas</label>
            <label><input type="checkbox" checked={filter.fw}
              onChange={e => setFilter({...filter,fw:e.target.checked})}/> FW</label>
          </div>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span>{count.toLocaleString("de-AT")} Treffer (max 200 dargestellt)</span>
          <button onClick={exportCSV} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">⬇ CSV</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase">
            <tr>
              <th className="p-2 text-left">Bez</th>
              <th className="p-2 text-left">Adresse</th>
              <th className="p-2 text-left">Stg/Tür</th>
              <th className="p-2 text-left">Strom</th>
              <th className="p-2 text-left">Gas</th>
              <th className="p-2 text-left">FW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.tuer_id} className="border-t">
                <td className="p-2">{r.bezirk}</td>
                <td className="p-2">{r.adresse}</td>
                <td className="p-2">{r.stiege} / {r.tuernr}</td>
                <td className="p-2">{r.strom ?? "–"}</td>
                <td className="p-2">{r.gas ?? "–"}</td>
                <td className="p-2">{r.fernwaerme ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
