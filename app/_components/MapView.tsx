'use client';
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Bau = {
  objectid: number;
  bezirk: number;
  plz: string;
  adresse: string;
  hofname: string | null;
  wohnungsanzahl: number | null;
  lat: number;
  lon: number;
  ist_gemeindebau: boolean;
  user_added: boolean;
  crawl_status: "pending" | "stale" | "done" | "partial";
  stiegen_count: number;
  tueren_count: number;
  tueren_wohnungen: number;
  tueren_mit_fw: number;
  tueren_mit_gas: number;
  tueren_kein_gas: number;
  tueren_mit_strom: number;
  heating_status: "fw" | "gas" | "mixed" | "other" | "unknown";
  // legacy:
  heizung_typ?: "fw" | "gas" | "andere" | "unbekannt";
  gas_quote: number | null;
  farb_kategorie: "gruen" | "hellgruen" | "gelb" | "orange" | "rot" | "grau";
  last_refresh: string | null;
  pdflink: string | null;
};

type Filter = {
  search: string;
  bezirk: string;
  showFw: boolean;
  showGas: boolean;
  showAndere: boolean;
  showUnbekannt: boolean;
  showPending: boolean;
};

const TILE_LAYERS = {
  standard: {
    url: "https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png",
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: "Standard",
  },
  grau: {
    url: "https://mapsneu.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png",
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: "Graustufen",
  },
  ortho: {
    url: "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: "Luftbild",
  },
};

// Farb-Kategorien aus bauten_map (basierend auf Gas-Quote)
const FARB_MAP: Record<string, { fill: string; stroke: string; label: string }> = {
  gruen:     { fill: "#16a34a", stroke: "#15803d", label: "0 % Gas (gasfrei)" },
  hellgruen: { fill: "#86efac", stroke: "#22c55e", label: "1–25 % Gas" },
  gelb:      { fill: "#fde047", stroke: "#ca8a04", label: "26–50 % Gas" },
  orange:    { fill: "#fb923c", stroke: "#ea580c", label: "51–75 % Gas" },
  rot:       { fill: "#dc2626", stroke: "#991b1b", label: "76–100 % Gas" },
  grau:      { fill: "#cbd5e1", stroke: "#94a3b8", label: "Noch nicht abgefragt" },
};

function makeIcon(b: Bau): L.DivIcon {
  const heiz = b.heating_status === "fw" ? "fw"
            : b.heating_status === "gas" ? "gas"
            : b.heating_status === "mixed" ? "gas"
            : b.heating_status === "other" ? "andere"
            : "unbekannt";
  const cls = b.crawl_status === "pending" ? "pending" : heiz;
  const big = b.wohnungsanzahl && b.wohnungsanzahl >= 200 ? " large" : "";
  return L.divIcon({
    className: "",
    html: `<div class="bau-marker ${cls}${big}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function popupHTML(b: Bau): string {
  const wf = b.tueren_mit_fw, wg = b.tueren_mit_gas, ws = b.tueren_mit_strom;
  const tot = b.tueren_count || 0;
  const wohn = b.wohnungsanzahl ?? "?";
  const refresh = b.last_refresh
    ? new Date(b.last_refresh).toLocaleDateString("de-AT")
    : "noch nie";
  const quote = b.gas_quote != null ? `${b.gas_quote}% Gas` : "";
  return `
    <div style="min-width:220px;font-size:13px">
      <div style="font-weight:600;font-size:14px">${b.adresse}</div>
      <div style="color:#64748b;font-size:11px;margin-bottom:6px">
        ${b.plz} · ${b.hofname ?? ""}${quote ? " · " + quote : ""}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
        <div><b>${wohn}</b><div style="font-size:10px;color:#64748b">Wohnungen</div></div>
        <div><b>${tot}</b><div style="font-size:10px;color:#64748b">Türen erfasst</div></div>
      </div>
      ${tot > 0 ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px;text-align:center;font-size:11px">
        <div style="background:#dcfce7;border-radius:4px;padding:3px"><b style="color:#15803d">${wf}</b><div>FW</div></div>
        <div style="background:#fff7ed;border-radius:4px;padding:3px"><b style="color:#c2410c">${wg}</b><div>Gas</div></div>
        <div style="background:#dbeafe;border-radius:4px;padding:3px"><b style="color:#1d4ed8">${ws}</b><div>Strom</div></div>
      </div>` : `<div style="font-size:11px;color:#94a3b8;margin-bottom:6px">noch nicht abgefragt</div>`}
      <div style="font-size:10px;color:#94a3b8;margin-bottom:8px">Letzte Abfrage: ${refresh}</div>
      <a href="/bau/${b.objectid}"
         style="display:block;background:#003a78;color:white;text-align:center;padding:8px;border-radius:6px;text-decoration:none;font-weight:600">
         Details ansehen →
      </a>
    </div>
  `;
}

export default function MapView() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<any>(null);
  const polyLayerRef = useRef<L.GeoJSON | null>(null);
  const waermeplanLayerRef = useRef<L.GeoJSON | null>(null);
  const router = useRouter();

  const [bauten, setBauten] = useState<Bau[]>([]);
  const [polygonsGeo, setPolygonsGeo] = useState<any | null>(null);
  const [waermeplanGeo, setWaermeplanGeo] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [tileKey, setTileKey] = useState<keyof typeof TILE_LAYERS>("standard");
  const [showPolygons, setShowPolygons] = useState(true);
  const [showPins, setShowPins] = useState(false);
  const [showWaermeplan, setShowWaermeplan] = useState(false);
  const [filter, setFilter] = useState<Filter>({
    search: "", bezirk: "",
    showFw: true, showGas: true, showAndere: true, showUnbekannt: true, showPending: true,
  });
  const [showFilter, setShowFilter] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  // Load all bauten + polygons in parallel
  useEffect(() => {
    const sb = createClient();
    Promise.all([
      sb.from("bauten_map").select("*").then((res: any) => {
        if (res.error) throw res.error;
        return (res.data ?? []) as Bau[];
      }),
      fetch("/gemeindebauten.geojson").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([bautenData, polyData]) => {
      setBauten(bautenData);
      setPolygonsGeo(polyData);
      setLoaded(true);
    }).catch(err => {
      console.error("load error", err);
      setLoaded(true);
    });
  }, []);

  // Lazy-load Wärmeplan (~290 KB) erst wenn aktiviert
  useEffect(() => {
    if (showWaermeplan && !waermeplanGeo) {
      fetch("/waermeplan.geojson")
        .then(r => r.ok ? r.json() : null)
        .then(setWaermeplanGeo)
        .catch(err => console.error("Wärmeplan load failed", err));
    }
  }, [showWaermeplan, waermeplanGeo]);

  // Init map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: [48.2082, 16.3738],
      zoom: 12,
      zoomControl: true,
      preferCanvas: true,  // mehr Performance bei 1.6k Polygonen
    });
    mapRef.current = map;
    tileLayerRef.current = L.tileLayer(TILE_LAYERS.standard.url, {
      attribution: TILE_LAYERS.standard.attr,
      maxZoom: 19,
      subdomains: ["", "1", "2", "3", "4"],
    }).addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Switch tile layer
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const t = TILE_LAYERS[tileKey];
    tileLayerRef.current = L.tileLayer(t.url, {
      attribution: t.attr, maxZoom: 19,
      subdomains: ["", "1", "2", "3", "4"],
    }).addTo(mapRef.current);
  }, [tileKey]);

  // Map: objectid → Bau für O(1) Lookup beim Polygon-Style
  const bauByObjectId = useMemo(() => {
    const m = new Map<number, Bau>();
    bauten.forEach(b => m.set(b.objectid, b));
    return m;
  }, [bauten]);

  // Filter visible bauten
  const visible = useMemo(() => {
    return bauten.filter(b => {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!b.adresse.toLowerCase().includes(q) &&
            !(b.hofname ?? "").toLowerCase().includes(q)) return false;
      }
      if (filter.bezirk && b.bezirk !== parseInt(filter.bezirk)) return false;
      if (b.crawl_status === "pending") return filter.showPending;
      const heiz = b.heating_status;
      if (heiz === "fw")    return filter.showFw;
      if (heiz === "gas" || heiz === "mixed") return filter.showGas;
      if (heiz === "other") return filter.showAndere;
      if (heiz === "unknown") return filter.showUnbekannt;
      return true;
    });
  }, [bauten, filter]);

  const visibleObjectIds = useMemo(() => new Set(visible.map(b => b.objectid)), [visible]);

  // Render polygons layer
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    if (polyLayerRef.current) {
      mapRef.current.removeLayer(polyLayerRef.current);
      polyLayerRef.current = null;
    }
    if (!showPolygons || !polygonsGeo) return;

    // Filter geojson to currently visible bauten
    const filteredFeatures = polygonsGeo.features.filter((f: any) =>
      visibleObjectIds.has(f.properties.objectid)
    );

    const layer = L.geoJSON({ type: "FeatureCollection", features: filteredFeatures } as any, {
      style: (feature: any) => {
        const b = bauByObjectId.get(feature.properties.objectid);
        const farb = b?.farb_kategorie ?? "grau";
        const c = FARB_MAP[farb];
        return {
          fillColor: c.fill,
          fillOpacity: 0.55,
          color: c.stroke,
          weight: 1,
          opacity: 0.9,
        };
      },
      onEachFeature: (feature: any, lyr: L.Layer) => {
        const b = bauByObjectId.get(feature.properties.objectid);
        if (!b) return;
        lyr.bindPopup(popupHTML(b), { maxWidth: 280 });
        lyr.on("popupopen", (e: any) => {
          const popup = e.popup.getElement();
          const a = popup?.querySelector("a[href^='/bau/']") as HTMLAnchorElement | null;
          if (a) a.onclick = (ev) => { ev.preventDefault(); router.push(a.getAttribute("href")!); };
        });
      },
    });
    layer.addTo(mapRef.current);
    polyLayerRef.current = layer;
  }, [showPolygons, polygonsGeo, visibleObjectIds, bauByObjectId, loaded, router]);

  // Render Wärmeplan-Layer
  useEffect(() => {
    if (!mapRef.current) return;
    if (waermeplanLayerRef.current) {
      mapRef.current.removeLayer(waermeplanLayerRef.current);
      waermeplanLayerRef.current = null;
    }
    if (!showWaermeplan || !waermeplanGeo) return;

    const layer = L.geoJSON(waermeplanGeo, {
      style: () => ({
        fillColor: "#8b5cf6",
        fillOpacity: 0.18,
        color: "#7c3aed",
        weight: 1.5,
        dashArray: "4 3",
      }),
      onEachFeature: (feature: any, lyr: L.Layer) => {
        const p = feature.properties;
        lyr.bindPopup(`
          <div style="font-size:13px;min-width:200px">
            <div style="font-weight:600">Klimaschutzzone ${p.bezirk}. Bezirk</div>
            <div style="color:#64748b;font-size:11px;margin:4px 0 8px">
              In dieser Zone darf bei Neubau bzw. Generalsanierung kein Gas
              mehr installiert werden.
            </div>
            ${p.plan_pdf ? `<a href="${p.plan_pdf}" target="_blank" style="color:#7c3aed;font-size:11px;text-decoration:underline">📄 Plan</a>` : ""}
            ${p.verordnung_pdf ? ` · <a href="${p.verordnung_pdf}" target="_blank" style="color:#7c3aed;font-size:11px;text-decoration:underline">📄 Verordnung</a>` : ""}
          </div>
        `, { maxWidth: 260 });
      },
    });
    layer.addTo(mapRef.current);
    waermeplanLayerRef.current = layer;
  }, [showWaermeplan, waermeplanGeo]);

  // Render markers via cluster (optional)
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    if (clusterRef.current) {
      mapRef.current.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (!showPins) return;
    // @ts-ignore
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    visible.forEach(b => {
      const m = L.marker([b.lat, b.lon], { icon: makeIcon(b) })
        .bindPopup(popupHTML(b), { maxWidth: 280 });
      m.on("popupopen", (e) => {
        const popup = e.popup.getElement();
        const a = popup?.querySelector("a[href^='/bau/']") as HTMLAnchorElement | null;
        if (a) a.onclick = (ev) => { ev.preventDefault(); router.push(a.getAttribute("href")!); };
      });
      cluster.addLayer(m);
    });
    mapRef.current.addLayer(cluster);
    clusterRef.current = cluster;
  }, [visible, loaded, router, showPins]);

  // KPIs
  const kpis = useMemo(() => ({
    total:    bauten.length,
    visible:  visible.length,
    fw:       bauten.filter(b => b.heating_status === "fw").length,
    gas:      bauten.filter(b => b.heating_status === "gas" || b.heating_status === "mixed").length,
    pending:  bauten.filter(b => b.crawl_status === "pending").length,
  }), [bauten, visible]);

  return (
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      <div ref={mapEl} className="leaflet-container fullbleed" />

      {/* Top: search + tile switcher + layer toggle */}
      <div className="absolute top-3 inset-x-3 z-[400] flex gap-2 pointer-events-none">
        <div className="flex-1 pointer-events-auto bg-white rounded-xl shadow-lg flex items-center px-3 py-2">
          <span className="text-slate-400 mr-2">🔍</span>
          <input value={filter.search}
            onChange={e => setFilter({...filter, search: e.target.value})}
            placeholder="Adresse oder Hofname …"
            className="bg-transparent outline-none flex-1 text-sm" />
          <button onClick={() => setShowFilter(!showFilter)}
            className="ml-2 px-2 py-1 rounded text-slate-500 hover:bg-slate-100 text-sm">
            ⚙
          </button>
        </div>
        <select value={tileKey}
          onChange={e => setTileKey(e.target.value as any)}
          className="pointer-events-auto bg-white rounded-xl shadow-lg px-3 py-2 text-sm border-0">
          {Object.entries(TILE_LAYERS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="absolute top-16 right-3 z-[400] bg-white rounded-xl shadow-xl p-3 w-72 max-w-[calc(100%-1.5rem)]">
          <div className="text-xs font-semibold text-slate-500 mb-2">LAYER</div>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={showPolygons}
              onChange={e => setShowPolygons(e.target.checked)} />
            🟦 Polygone (nach Gas-Anteil)
          </label>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={showPins}
              onChange={e => setShowPins(e.target.checked)} />
            📍 Pins (nach Heizungs-Status)
          </label>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={showWaermeplan}
              onChange={e => setShowWaermeplan(e.target.checked)} />
            🟣 Klimaschutzzonen (Wiener Energieraumplan)
          </label>

          <div className="text-xs font-semibold text-slate-500 mt-3 mb-2">BEZIRK</div>
          <select value={filter.bezirk}
            onChange={e => setFilter({...filter, bezirk: e.target.value})}
            className="w-full mb-3 border rounded-lg px-2 py-1.5 text-sm">
            <option value="">Alle Bezirke</option>
            {Array.from({length:23},(_,i)=>i+1).map(n =>
              <option key={n} value={n}>{n}. Bezirk</option>)}
          </select>
          <div className="text-xs font-semibold text-slate-500 mb-2">HEIZUNGS-STATUS</div>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={filter.showFw}
              onChange={e => setFilter({...filter, showFw: e.target.checked})} />
            <span className="bau-marker fw inline-block" style={{width:10,height:10}}/> Fernwärme
          </label>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={filter.showGas}
              onChange={e => setFilter({...filter, showGas: e.target.checked})} />
            <span className="bau-marker gas inline-block" style={{width:10,height:10}}/> Gas
          </label>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={filter.showAndere}
              onChange={e => setFilter({...filter, showAndere: e.target.checked})} />
            <span className="bau-marker andere inline-block" style={{width:10,height:10}}/> andere/keine
          </label>
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={filter.showPending}
              onChange={e => setFilter({...filter, showPending: e.target.checked})} />
            <span className="bau-marker pending inline-block" style={{width:10,height:10}}/> noch nicht abgefragt
          </label>
        </div>
      )}

      {/* Legende */}
      {showLegend && showPolygons && (
        <div className="absolute bottom-16 right-3 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-lg p-3 text-[11px] max-w-[calc(100%-1.5rem)]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-semibold text-slate-700">Gas-Anteil pro Bau</div>
            <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-700 ml-2 text-xs">✕</button>
          </div>
          <div className="space-y-1">
            {(["gruen","hellgruen","gelb","orange","rot","grau"] as const).map(k => (
              <div key={k} className="flex items-center gap-2">
                <span className="inline-block w-4 h-3 rounded-sm border"
                  style={{ background: FARB_MAP[k].fill, borderColor: FARB_MAP[k].stroke }} />
                <span>{FARB_MAP[k].label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom KPI bar */}
      <div className="absolute bottom-3 inset-x-3 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-lg px-4 py-2 flex justify-between items-center text-sm pointer-events-auto">
        <div>
          <span className="font-semibold">{kpis.visible.toLocaleString("de-AT")}</span>
          <span className="text-slate-500"> von {kpis.total.toLocaleString("de-AT")} Bauten</span>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-green-700"><b>{kpis.fw}</b> FW</span>
          <span className="text-orange-700"><b>{kpis.gas}</b> Gas</span>
          <span className="text-slate-500"><b>{kpis.pending}</b> offen</span>
        </div>
      </div>

      {!loaded && (
        <div className="absolute inset-0 grid place-items-center bg-white/60 z-[500]">
          <div className="text-slate-600 text-sm">Lade Gemeindebauten …</div>
        </div>
      )}

      {/* DEBUG */}
      <div className="absolute top-20 left-2 z-[9999] bg-black/80 text-white text-xs p-2 rounded space-y-1 pointer-events-none">
        <div>{"loaded: " + String(loaded)}</div>
        <div>{"bauten: " + bauten.length}</div>
        <div>{"geo: " + (polygonsGeo ? polygonsGeo.features?.length + " feat" : "null")}</div>
        <div>{"map: " + (mapRef.current ? "ok" : "null")}</div>
        <div
