'use client';
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase";

const MiniMap = dynamic(() => import("../../_components/MiniMap"), { ssr: false });

type Bau = {
  objectid: number; bezirk: number; plz: string; adresse: string;
  hofname: string | null; wohnungsanzahl: number | null;
  lat: number; lon: number; ist_gemeindebau: boolean;
  pdflink: string | null;
  baujahr: number | null;
};

type Stiege = {
  id: number; stiege: string; tuernr_stiege?: string | null;
  gebadr1: string; hausnummer: string; vstelle: string | null;
  last_refresh: string;
};

type Tuer = {
  id: number; stiege_id: number; tuernr: string;
  anladr1: string; vstelle: string | null;
  last_refresh: string;
};

type SparteRow = {
  id: number; tuer_id: number | null; stiege_id: number | null;
  sparte: string; verfuegbar: string;
  details: any[] | null; fetched_at: string;
};

const SPARTEN_PRIO = ["Strom", "Gas", "Fernwaerme", "Internet", "Iptv", "Voip", "B2B Glasfaser", "Mobiles Internet", "Nachtstrom", "Stromrueck"];

function decodeTarif(code: string | null): string {
  if (!code) return "";
  if (code.startsWith("SOPTB")) return `Smart Optima Basic`;
  if (code.startsWith("SOPTP")) return `Smart Optima Premium`;
  if (code.startsWith("GEOPTB")) return `Gas Optima Basic`;
  if (code.startsWith("GEOPTP")) return `Gas Optima Premium`;
  if (code.startsWith("GEMEG"))  return `Gewerbe`;
  return code;
}

function badge(v: string | null | undefined) {
  if (!v) return <span className="text-slate-300">–</span>;
  const cls =
    v === "JA" ? "bg-green-100 text-green-700 border-green-200" :
    v === "NEIN" ? "bg-slate-100 text-slate-500 border-slate-200" :
    "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={`text-[11px] px-1.5 py-0.5 rounded border ${cls}`}>{v}</span>;
}

// Gas UNBEKANNT bei Wohnung (Strom=JA) bedeutet "kein Gaszähler" → NEIN anzeigen
function badgeGasEffektiv(gas: SparteRow | null, strom: SparteRow | null) {
  if (!gas) return badge(null);
  if (gas.verfuegbar === "UNBEKANNT" && strom?.verfuegbar === "JA") {
    return (
      <span
        title="Kein Gaszähler vorhanden (API liefert UNBEKANNT)"
        className="text-[11px] px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-200"
      >
        NEIN
      </span>
    );
  }
  return badge(gas.verfuegbar);
}

export default function BauDetail() {
  const params = useParams();
  const router = useRouter();
  const objectid = Number(params.objectid);
  const sb = createClient();

  const [bau, setBau] = useState<Bau | null>(null);
  const [stiegen, setStiegen] = useState<Stiege[]>([]);
  const [tueren, setTueren] = useState<Tuer[]>([]);
  const [tuerSparten, setTuerSparten] = useState<SparteRow[]>([]);
  const [stiegeSparten, setStiegeSparten] = useState<SparteRow[]>([]);
  const [openStiegen, setOpenStiegen] = useState<Set<number>>(new Set());
  const [showAllSparten, setShowAllSparten] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: b } = await sb.from("gemeindebau").select("*").eq("objectid", objectid).single();
      if (!active) return;
      setBau(b as Bau);

      // Stiegen sortieren: zuerst nach Hausnummer (19 vor 19-23), dann nach Stiegen-Label
      const { data: s } = await sb
        .from("stiege")
        .select("*")
        .eq("objectid", objectid)
        .order("hausnummer")
        .order("stiege");
      if (!active) return;
      setStiegen((s ?? []) as Stiege[]);

      const stiegeIds = (s ?? []).map((x: any) => x.id);
      if (stiegeIds.length) {
        const { data: t } = await sb.from("tuer").select("*").in("stiege_id", stiegeIds);
        if (!active) return;
        const sortedT = (t ?? []).sort((a: any, b: any) => {
          const aN = parseInt(a.tuernr) || 9999, bN = parseInt(b.tuernr) || 9999;
          return aN - bN;
        });
        setTueren(sortedT as Tuer[]);

        // Sparten der Stiegen (Allgemeinflächen)
        const { data: ssp } = await sb.from("stiege_sparte_aktuell").select("*").in("stiege_id", stiegeIds);
        setStiegeSparten((ssp ?? []) as SparteRow[]);

        // Sparten der Türen
        const tuerIds = sortedT.map((x: any) => x.id);
        if (tuerIds.length) {
          const chunks: SparteRow[] = [];
          for (let i = 0; i < tuerIds.length; i += 200) {
            const slice = tuerIds.slice(i, i + 200);
            const { data: tsp } = await sb.from("tuer_sparte_aktuell").select("*").in("tuer_id", slice);
            chunks.push(...((tsp ?? []) as SparteRow[]));
          }
          setTuerSparten(chunks);
        }
      }
      // Default: alle Stiegen offen wenn ≤ 3, sonst geschlossen
      if (s && s.length <= 3) setOpenStiegen(new Set(s.map((x: any) => x.id)));
    }
    load();
    return () => { active = false; };
  }, [objectid]);

  function toggle(id: number) {
    const n = new Set(openStiegen);
    n.has(id) ? n.delete(id) : n.add(id);
    setOpenStiegen(n);
  }

  function tuerSparteByKey(tid: number, sparte: string): SparteRow | null {
    return tuerSparten.find(x => x.tuer_id === tid && x.sparte === sparte) ?? null;
  }
  function stiegeSparteByKey(sid: number, sparte: string): SparteRow | null {
    return stiegeSparten.find(x => x.stiege_id === sid && x.sparte === sparte) ?? null;
  }

  async function refreshAll() {
    if (!bau) return;
    setBusy(true);
    const { data: job } = await sb.from("query_job").insert({
      user_id: null,
      scope: "haus",
      objectid: bau.objectid,
      force_refresh: true,
      is_async: true,
    }).select().single();
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ job_id: job!.id }),
    });
    router.push(`/jobs/${job!.id}`);
  }

  async function refreshStiege(stiege: string) {
    if (!bau) return;
    setBusy(true);
    const { data: job } = await sb.from("query_job").insert({
      user_id: null,
      scope: "stiege",
      objectid: bau.objectid,
      stiege,
      force_refresh: true,
      is_async: true,
    }).select().single();
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ job_id: job!.id }),
    });
    router.push(`/jobs/${job!.id}`);
  }

  function exportCSV() {
    const cols = [
      "stiege","tuernr","gebadr1","anladr1","vstelle",
      "strom","strom_zp","strom_smartmeter","strom_lastprofil","strom_tarif",
      "gas","gas_effektiv","gas_zp","gas_lastprofil","gas_tarif",
      "fernwaerme","fw_nutzungsObjektId","fw_vertragsBeginn","fw_lieferkomponente",
      "internet","iptv","voip","b2b_glasfaser","mobiles_internet"
    ];
    const lines = [cols.join(",")];
    for (const t of tueren) {
      const stg = stiegen.find(s => s.id === t.stiege_id);
      const get = (sp: string, key?: string) => {
        const r = tuerSparteByKey(t.id, sp);
        if (!r) return "";
        if (!key) return r.verfuegbar ?? "";
        return r.details?.[0]?.[key] ?? "";
      };
      // Gas-Effektiv: UNBEKANNT bei Wohnung -> NEIN
      const gasRaw = tuerSparteByKey(t.id, "Gas")?.verfuegbar ?? "";
      const stromRaw = tuerSparteByKey(t.id, "Strom")?.verfuegbar ?? "";
      const gasEff = (gasRaw === "UNBEKANNT" && stromRaw === "JA") ? "NEIN" : gasRaw;
      const row = [
        stg?.stiege ?? "", t.tuernr, stg?.gebadr1 ?? "", t.anladr1, t.vstelle ?? "",
        get("Strom"), get("Strom","zaehlpunktnummer"), get("Strom","smartMeter"), get("Strom","lastprofil"), get("Strom","tarifTyp"),
        gasRaw, gasEff, get("Gas","zaehlpunktnummer"), get("Gas","lastprofil"), get("Gas","tarifTyp"),
        get("Fernwaerme"), get("Fernwaerme","nutzungsObjektId"), get("Fernwaerme","vertragsBeginn"), get("Fernwaerme","lieferkomponente"),
        get("Internet"), get("Iptv"), get("Voip"), get("B2B Glasfaser"), get("Mobiles Internet"),
      ];
      lines.push(row.map(v => JSON.stringify(v ?? "")).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bau-${objectid}-${(bau?.adresse ?? "").replace(/\W+/g,"_")}.csv`;
    a.click();
  }

  if (!bau) return <main className="p-4">Lade …</main>;

  // KPIs
  const total = tueren.length;
  const withFw = new Set(tuerSparten.filter(s => s.sparte === "Fernwaerme" && s.verfuegbar === "JA").map(s => s.tuer_id)).size;
  const withGas = new Set(tuerSparten.filter(s => s.sparte === "Gas" && s.verfuegbar === "JA").map(s => s.tuer_id)).size;
  const withStrom = new Set(tuerSparten.filter(s => s.sparte === "Strom" && s.verfuegbar === "JA").map(s => s.tuer_id)).size;

  return (
    <div className="pb-4">
      {/* Hero */}
      <header className="hero-dark text-white">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-6">
          <Link href="/" className="text-blue-300/80 text-xs">← Karte</Link>
          <div className="mt-2 flex flex-wrap gap-2 items-baseline">
            <h1 className="text-2xl font-bold">{bau.adresse}</h1>
            <span className="text-blue-200/80 text-sm">{bau.plz} · Bezirk {bau.bezirk}</span>
          </div>
          {bau.hofname && (
            <div className="text-sm text-blue-200/70 mt-0.5">
              Hofname: <b className="text-white/90">{bau.hofname}</b>
              {bau.baujahr && <span className="ml-2">· Baujahr {bau.baujahr}</span>}
            </div>
          )}
          {bau.pdflink && (
            <a
              href={bau.pdflink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-blue-100 text-xs rounded border border-white/20 transition"
            >
              📄 Hofinformation (PDF)
            </a>
          )}

          {/* KPI cards */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KPI label="Wohnungen (Register)" value={bau.wohnungsanzahl?.toLocaleString("de-AT") ?? "—"} />
            <KPI label="Türen erfasst" value={total.toLocaleString("de-AT")} />
            <KPI label="Stiegen" value={stiegen.length.toString()} />
            <KPI label="Letzte Abfrage" value={
              tueren.length ? new Date(Math.max(...tueren.map(t => new Date(t.last_refresh).getTime()))).toLocaleDateString("de-AT") : "—"
            } />
          </div>
          {total > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <PercentBar label="Strom"      value={withStrom} max={total} color="bg-blue-400"   />
              <PercentBar label="Gas"        value={withGas}   max={total} color="bg-orange-400" />
              <PercentBar label="Fernwärme"  value={withFw}    max={total} color="bg-green-400"  />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 -mt-4 space-y-4">
        {/* Aktionen + Mini-Map */}
        <div className="bg-white rounded-xl shadow-sm p-4 grid sm:grid-cols-[1fr_220px] gap-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 mb-1">Aktionen</div>
            <button onClick={refreshAll} disabled={busy}
              className="w-full bg-[var(--brand)] hover:bg-blue-900 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              🔄 Ganzen Bau aktualisieren
            </button>
            <button onClick={exportCSV}
              className="w-full bg-white border hover:bg-slate-50 text-slate-700 rounded-lg py-2 text-sm font-medium">
              ⬇ CSV exportieren
            </button>
            <button onClick={() => setShowAllSparten(!showAllSparten)}
              className="w-full bg-white border hover:bg-slate-50 text-slate-700 rounded-lg py-2 text-sm font-medium">
              {showAllSparten ? "Weniger Sparten" : "Alle Sparten zeigen"}
            </button>
          </div>
          <div className="rounded-lg overflow-hidden border h-[180px]">
            <MiniMap lat={bau.lat} lon={bau.lon} label={bau.adresse} />
          </div>
        </div>

        {/* Stiegen-Tree */}
        <section>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            01 · {stiegen.length} Stiege{stiegen.length !== 1 ? "n" : ""}
          </div>
          {stiegen.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center text-sm text-slate-500">
              Noch keine Daten – starte oben "Ganzen Bau aktualisieren".
            </div>
          ) : (
            <div className="space-y-2">
              {stiegen.map(s => {
                const stiegeTueren = tueren.filter(t => t.stiege_id === s.id);
                const open = openStiegen.has(s.id);
                const sJa = stiegeSparten.filter(x => x.stiege_id === s.id && x.verfuegbar === "JA").map(x => x.sparte);
                return (
                  <div key={s.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <button onClick={() => toggle(s.id)}
                      className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50">
                      <span className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                      <div className="flex-1">
                        <div className="font-semibold text-sm">
                          Stiege {s.gebadr1 || s.stiege || "—"}
                          {s.tuernr_stiege && (
                            <span className="ml-2 text-xs text-slate-500 font-normal">
                              ({s.tuernr_stiege})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {stiegeTueren.length} Türen · Allgemein: {sJa.join(", ") || "—"}
                          {s.vstelle && ` · vstelle ${s.vstelle}`}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); refreshStiege(s.stiege); }}
                        className="text-xs text-[var(--brand-light)] hover:underline">
                        🔄
                      </button>
                    </button>

                    {open && (
                      <div className="border-t">
                        {/* Stiegen-Sparten (Allgemein) */}
                        {stiegeSparten.filter(x => x.stiege_id === s.id).length > 0 && (
                          <div className="bg-slate-50 px-3 py-2">
                            <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Allgemein-Sparten</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                              {SPARTEN_PRIO.filter(sp => showAllSparten || ["Strom","Gas","Fernwaerme"].includes(sp)).map(sp => {
                                const r = stiegeSparteByKey(s.id, sp);
                                if (!r) return null;
                                const zp = r.details?.[0]?.zaehlpunktnummer;
                                return (
                                  <div key={sp} className="text-xs">
                                    <span className="text-slate-500">{sp}</span> {badge(r.verfuegbar)}
                                    {zp && <div className="font-mono text-[10px] text-slate-500 truncate">{zp}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* Türen-Tabelle */}
                        {stiegeTueren.length > 0 ? (
                          <TuerTable
                            tueren={stiegeTueren}
                            getter={tuerSparteByKey}
                            showAll={showAllSparten}
                          />
                        ) : (
                          <div className="p-3 text-xs text-slate-400">
                            Keine Wohnungstüren erfasst (technische Anlage).
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 rounded-lg p-2.5 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-blue-200/70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
function PercentBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max ? Math.round((value/max)*100) : 0;
  return (
    <div className="bg-white/10 rounded-lg p-2 backdrop-blur">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-blue-200/70">{label}</span>
        <span className="font-semibold">{value}/{max} · {pct}%</span>
      </div>
      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{width: `${pct}%`}} />
      </div>
    </div>
  );
}

function TuerTable({ tueren, getter, showAll }: {
  tueren: Tuer[];
  getter: (tid: number, sparte: string) => SparteRow | null;
  showAll: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase">
          <tr>
            <th className="px-2 py-1.5 text-left">Tür</th>
            <th className="px-2 py-1.5 text-left">vstelle</th>
            <th className="px-2 py-1.5 text-left">Strom</th>
            <th className="px-2 py-1.5 text-left">Strom-Zähler</th>
            <th className="px-2 py-1.5 text-left">SM</th>
            <th className="px-2 py-1.5 text-left">Gas</th>
            <th className="px-2 py-1.5 text-left">Gas-Zähler</th>
            <th className="px-2 py-1.5 text-left">FW</th>
            <th className="px-2 py-1.5 text-left">FW-Vertrag</th>
            {showAll && <>
              <th className="px-2 py-1.5">Tarif (S)</th>
              <th className="px-2 py-1.5">Tarif (G)</th>
              <th className="px-2 py-1.5">Internet</th>
              <th className="px-2 py-1.5">IPTV</th>
              <th className="px-2 py-1.5">VoIP</th>
              <th className="px-2 py-1.5">B2B-Glas</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {tueren.map(t => {
            const strom = getter(t.id, "Strom");
            const gas   = getter(t.id, "Gas");
            const fw    = getter(t.id, "Fernwaerme");
            const inet  = getter(t.id, "Internet");
            const iptv  = getter(t.id, "Iptv");
            const voip  = getter(t.id, "Voip");
            const glas  = getter(t.id, "B2B Glasfaser");
            return (
              <tr key={t.id} className="border-t hover:bg-slate-50">
                <td className="px-2 py-1.5 font-semibold">{t.tuernr || "—"}</td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">{t.vstelle ?? ""}</td>
                <td className="px-2 py-1.5">{badge(strom?.verfuegbar)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{strom?.details?.[0]?.zaehlpunktnummer ?? ""}</td>
                <td className="px-2 py-1.5 text-[10px]">{strom?.details?.[0]?.smartMeter === "X" ? "✓" : ""}</td>
                <td className="px-2 py-1.5">{badgeGasEffektiv(gas, strom)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{gas?.details?.[0]?.zaehlpunktnummer ?? ""}</td>
                <td className="px-2 py-1.5">{badge(fw?.verfuegbar)}</td>
                <td className="px-2 py-1.5 text-[10px]">{fw?.details?.[0]?.vertragsBeginn ?? ""}</td>
                {showAll && <>
                  <td className="px-2 py-1.5 text-[10px]">{decodeTarif(strom?.details?.[0]?.tarifTyp)}</td>
                  <td className="px-2 py-1.5 text-[10px]">{decodeTarif(gas?.details?.[0]?.tarifTyp)}</td>
                  <td className="px-2 py-1.5">{badge(inet?.verfuegbar)}</td>
                  <td className="px-2 py-1.5">{badge(iptv?.verfuegbar)}</td>
                  <td className="px-2 py-1.5">{badge(voip?.verfuegbar)}</td>
                  <td className="px-2 py-1.5">{badge(glas?.verfuegbar)}</td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
