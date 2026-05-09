// app/abfrage/page.tsx
'use client';
import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Bau = {
  objectid: number;
  bezirk: number;
  plz: string;
  adresse: string;
  hofname: string | null;
  wohnungsanzahl: number | null;
  ist_gemeindebau: boolean;
};

export default function AbfragePage() {
  return (
    <Suspense fallback={<main className="max-w-2xl mx-auto p-4">Lade…</main>}>
      <Abfrage />
    </Suspense>
  );
}

function Abfrage() {
  const sb = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const deeplinkId = params.get("objectid");
  const [search, setSearch] = useState("");
  const [bezirk, setBezirk] = useState<string>("");
  const [hits, setHits] = useState<Bau[]>([]);
  const [picked, setPicked] = useState<Bau | null>(null);
  const [stiegen, setStiegen] = useState<{stiege:string}[]>([]);
  const [stiegeFilter, setStiegeFilter] = useState<string>("");
  const [tuerFilter, setTuerFilter] = useState<string>("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string|null>(null);

  // Deeplink: ?objectid=NN → Bau direkt vorausgewählt aus der Karte
  useEffect(() => {
    if (!deeplinkId || picked) return;
    sb.from("gemeindebau")
      .select("objectid,bezirk,plz,adresse,hofname,wohnungsanzahl,ist_gemeindebau")
      .eq("objectid", parseInt(deeplinkId))
      .single()
      .then(({ data }) => { if (data) setPicked(data as Bau); });
  }, [deeplinkId]);

  // Autocomplete
  useEffect(() => {
    if (search.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      let q = sb.from("gemeindebau")
        .select("objectid,bezirk,plz,adresse,hofname,wohnungsanzahl,ist_gemeindebau")
        .ilike("adresse", `%${search}%`)
        .limit(15);
      if (bezirk) q = q.eq("bezirk", parseInt(bezirk));
      const { data } = await q;
      setHits((data ?? []) as Bau[]);
    }, 250);
    return () => clearTimeout(t);
  }, [search, bezirk]);

  // Wenn ein Bau gewählt wird, Stiegen aus der DB laden (falls schon gecrawlt)
  useEffect(() => {
    if (!picked) return;
    sb.from("stiege")
      .select("stiege")
      .eq("objectid", picked.objectid)
      .order("stiege")
      .then(({ data }) => setStiegen(data ?? []));
  }, [picked]);

  async function startJob() {
    if (!picked) return;
    setBusy(true);
    if (!picked.ist_gemeindebau) {
      setWarning(null);
    }
    const scope = tuerFilter ? "tuer" : stiegeFilter ? "stiege" : "haus";
    const { data: job, error } = await sb.from("query_job").insert({
      user_id: null,
      scope,
      objectid: picked.objectid,
      hausnummer: null,                  // ganzer Bau
      stiege: stiegeFilter || null,
      tuernr: tuerFilter || null,
      force_refresh: forceRefresh,
      is_async: scope === "haus",        // ganzer Bau läuft async
    }).select().single();
    if (error) { setWarning(error.message); setBusy(false); return; }
    
    // Edge Function triggern (fire-and-forget bei async)
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crawl`;
    const trigger = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ job_id: job!.id }),
    });
    if (job!.is_async) {
      // im Hintergrund laufen lassen, sofort zur Job-Detail-Seite
      router.push(`/jobs/${job!.id}`);
    } else {
      // synchron warten
      await trigger;
      router.push(`/jobs/${job!.id}`);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <Link href="/" className="text-sm text-blue-600">← Zurück</Link>
      <h1 className="text-xl font-bold">Neue Abfrage</h1>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <label className="block text-sm">
          Bezirk (optional)
          <select value={bezirk} onChange={e => setBezirk(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2">
            <option value="">Alle</option>
            {Array.from({length:23},(_,i)=>i+1).map(n =>
              <option key={n} value={n}>{n}.{` `}Bezirk (1{String(n).padStart(2,"0")}0)</option>
            )}
          </select>
        </label>

        <label className="block text-sm">
          Adresse suchen
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="z.B. Sandleitengasse"
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>

        {hits.length > 0 && !picked && (
          <ul className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {hits.map(h => (
              <li key={h.objectid}>
                <button onClick={() => { setPicked(h); setSearch(h.adresse); setHits([]); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50">
                  <div className="font-medium">{h.adresse}</div>
                  <div className="text-xs text-slate-500">
                    {h.plz} · {h.hofname ?? ""} · {h.wohnungsanzahl ?? "?"} W.
                    {!h.ist_gemeindebau && " · ⚠ kein Gemeindebau"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-semibold">{picked.adresse}</div>
              <div className="text-sm text-slate-500">
                {picked.plz} · {picked.hofname} · {picked.wohnungsanzahl ?? "?"} Wohnungen
              </div>
              {picked.ist_gemeindebau ? (
                <div className="text-xs text-green-700 mt-1">✓ Gemeindebau bestätigt</div>
              ) : (
                <div className="text-xs text-amber-700 mt-1">
                  ⚠ Kein verifizierter Gemeindebau – Abfrage trotzdem möglich
                </div>
              )}
            </div>
            <button onClick={() => { setPicked(null); setStiegen([]); setStiegeFilter(""); setTuerFilter(""); }}
              className="text-sm text-slate-500">Anderen wählen</button>
          </div>

          {stiegen.length > 0 ? (
            <label className="block text-sm">
              Stiege (optional, sonst alle)
              <select value={stiegeFilter} onChange={e => setStiegeFilter(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2">
                <option value="">Alle Stiegen</option>
                {stiegen.map(s => (
                  <option key={s.stiege} value={s.stiege}>
                    Stiege {s.stiege}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-xs text-slate-500">
              Keine Stiegen-Daten vorhanden (Bau noch nicht gecrawlt).
              Du kannst trotzdem den ganzen Bau abfragen oder eine Stiege/Tür manuell eintippen.
            </p>
          )}

          {(stiegeFilter || stiegen.length === 0) && (
            <label className="block text-sm">
              Stiege manuell (optional)
              <input value={stiegeFilter} onChange={e => setStiegeFilter(e.target.value)}
                placeholder="z.B. 13"
                className="mt-1 w-full border rounded-lg px-3 py-2" />
            </label>
          )}

          {stiegeFilter && (
            <label className="block text-sm">
              Türnummer (optional)
              <input value={tuerFilter} onChange={e => setTuerFilter(e.target.value)}
                placeholder="z.B. 7"
                className="mt-1 w-full border rounded-lg px-3 py-2" />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forceRefresh}
              onChange={e => setForceRefresh(e.target.checked)} />
            Frisch abrufen (überschreibt vorhandene Daten)
          </label>

          <button onClick={startJob} disabled={busy}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {busy ? "Starte Job …" : "Abfrage starten"}
          </button>

          {warning && <p className="text-red-600 text-sm">{warning}</p>}
        </div>
      )}
    </main>
  );
}
