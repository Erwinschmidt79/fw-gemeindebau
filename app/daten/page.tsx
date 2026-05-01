'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function Daten() {
  const sb = createClient();
  const [search, setSearch] = useState("");
  const [bezirk, setBezirk] = useState("");
  const [filter, setFilter] = useState({strom:false, gas:false, fw:false, hasGasZP:false});
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = sb.from("tuer_uebersicht").select("*", { count: "exact" }).limit(300);
      if (search) q = q.or(`adresse.ilike.%${search}%,hofname.ilike.%${search}%`);
      if (bezirk) q = q.eq("bezirk", parseInt(bezirk));
      if (filter.strom) q = q.eq("strom", "JA");
      if (filter.gas)   q = q.eq("gas", "JA");
      if (filter.fw)    q = q.eq("fernwaerme", "JA");
      if (filter.hasGasZP) q = q.not("gas_zp", "is", null);
      const { data, count } = await q.order("bezirk").order("adresse").order("stiege").order("tuernr");
      setRows(data ?? []);
      setCount(count ?? 0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, bezirk, filter]);

  function exportCSV() {
    const cols = showAll ? [
      "bezirk","plz","adresse","hofname","stiege","tuernr","tuer_vstelle",
      "strom","strom_zp","strom_smartmeter","strom_tarif",
      "gas","gas_zp","gas_tarif",
      "fernwaerme","fw_vertragsBeginn","fw_nutzungsObjektId",
      "internet","iptv","voip","b2b_glasfaser"
    ] : ["bezirk","adresse","stiege","tuernr","strom","strom_zp","gas","gas_zp","fernwaerme"];
    const csv = [cols.join(",")].concat(rows.map(r =>
      cols.map(c => JSON.stringify(r[c] ?? "")).join(",")
    )).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `daten-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  return (
    <div className="pb-4">
      <header className="hero-dark text-white px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] uppercase tracking-wider text-blue-300/80">Datenbestand</div>
          <h1 className="text-xl font-bold">Türen-Suche</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 -mt-2 space-y-3">
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Adresse / Hofname"
              className="border rounded-lg px-3 py-2 text-sm" />
            <select value={bezirk} onChange={e => setBezirk(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Alle Bezirke</option>
              {Array.from({length:23},(_,i)=>i+1).map(n =>
                <option key={n} value={n}>Bezirk {n}</option>)}
            </select>
            <button onClick={exportCSV}
              className="border rounded-lg py-2 text-sm font-medium bg-[var(--brand)] text-white">
              ⬇ {rows.length.toLocaleString("de-AT")} Zeilen als CSV
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label><input type="checkbox" checked={filter.strom}
              onChange={e => setFilter({...filter, strom:e.target.checked})}/> nur Strom JA</label>
            <label><input type="checkbox" checked={filter.gas}
              onChange={e => setFilter({...filter, gas:e.target.checked})}/> nur Gas JA</label>
            <label><input type="checkbox" checked={filter.fw}
              onChange={e => setFilter({...filter, fw:e.target.checked})}/> nur FW JA</label>
            <label><input type="checkbox" checked={filter.hasGasZP}
              onChange={e => setFilter({...filter, hasGasZP:e.target.checked})}/> mit Gas-Zähler</label>
            <label className="ml-auto"><input type="checkbox" checked={showAll}
              onChange={e => setShowAll(e.target.checked)}/> alle Spalten</label>
          </div>
          <div className="text-xs text-slate-500">
            {count.toLocaleString("de-AT")} Treffer (max. 300 angezeigt)
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">Bez</th>
                <th className="px-2 py-2 text-left">Adresse</th>
                <th className="px-2 py-2 text-left">Stg/Tür</th>
                <th className="px-2 py-2 text-left">Strom</th>
                <th className="px-2 py-2 text-left">Strom-Zähler</th>
                <th className="px-2 py-2 text-left">Gas</th>
                <th className="px-2 py-2 text-left">Gas-Zähler</th>
                <th className="px-2 py-2 text-left">FW</th>
                {showAll && <>
                  <th className="px-2 py-2 text-left">FW-Start</th>
                  <th className="px-2 py-2 text-left">SM</th>
                  <th className="px-2 py-2 text-left">Internet</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.tuer_id} className="border-t hover:bg-slate-50">
                  <td className="px-2 py-1.5">{r.bezirk}</td>
                  <td className="px-2 py-1.5">
                    <Link href={`/bau/${r.objectid}`} className="text-[var(--brand-light)] hover:underline">
                      {r.adresse}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{r.stiege} / {r.tuernr}</td>
                  <td className="px-2 py-1.5">{r.strom ?? "–"}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.strom_zp ?? ""}</td>
                  <td className="px-2 py-1.5">{r.gas ?? "–"}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.gas_zp ?? ""}</td>
                  <td className="px-2 py-1.5">{r.fernwaerme ?? "–"}</td>
                  {showAll && <>
                    <td className="px-2 py-1.5 text-[11px]">{r.fw_vertragsBeginn ?? ""}</td>
                    <td className="px-2 py-1.5">{r.strom_smartmeter === "X" ? "✓" : ""}</td>
                    <td className="px-2 py-1.5">{r.internet ?? ""}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Keine Treffer.</div>}
        </div>
      </div>
    </div>
  );
}
