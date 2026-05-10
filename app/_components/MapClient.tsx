'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import { createClient } from '@supabase/supabase-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// -- Supabase ----------------------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// -- Types -------------------------------------------------------------------
type Farbe = 'grau' | 'gruen' | 'hellgruen' | 'gelb' | 'orange' | 'rot'

type BauRow = {
  objectid: number
  hofname: string | null
  adresse: string
  bezirk: number
  plz: string
  baujahr: number | null
  wohnungsanzahl: number | null
  pdflink: string | null
  lat: number
  lon: number
  geom_geojson: any | null
  tueren_total: number
  tueren_erfasst: number
  tueren_fw: number
  tueren_gas: number
  crawl_status: 'pending' | 'partial' | 'done'
  heating_status: 'unknown' | 'fw' | 'gas' | 'mixed' | 'other'
  farb_kategorie: Farbe
}

// -- Colors ------------------------------------------------------------------
const COLORS: Record<Farbe, string> = {
  grau:      '#9ca3af',
  gruen:     '#15803d',
  hellgruen: '#65a30d',
  gelb:      '#eab308',
  orange:    '#ea580c',
  rot:       '#b91c1c',
}

// -- Tile layers (basemap.at, Wien-optimiert) -------------------------------
type TileKey = 'standard' | 'grau' | 'ortho'
const TILE_LAYERS: Record<TileKey, { url: string; attr: string; label: string }> = {
  standard: {
    url:  'https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png',
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: 'Standard',
  },
  grau: {
    url:  'https://mapsneu.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png',
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: 'Graustufen',
  },
  ortho: {
    url:  'https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
    attr: '© <a href="https://basemap.at">basemap.at</a>',
    label: 'Luftbild',
  },
}

// -- Component ---------------------------------------------------------------
export default function MapClient() {
  const [bauten, setBauten]   = useState<BauRow[]>([])
  const [error,  setError]    = useState<string | null>(null)
  const [loading,setLoading]  = useState(true)
  const [search, setSearch]   = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [tileKey, setTileKey] = useState<TileKey>('standard')
  const mapRef = useRef<L.Map | null>(null)

  // Fetch
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const PAGE = 1000
      const acc: BauRow[] = []
      try {
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('bauten_map')
            .select('*')
            .range(from, from + PAGE - 1)
          if (error) throw error
          if (!data || data.length === 0) break
          acc.push(...(data as BauRow[]))
          if (data.length < PAGE) break
        }
        if (!cancelled) {
          setBauten(acc)
          setLoading(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e))
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Filter by search
  const visible = useMemo(() => {
    if (!search.trim()) return bauten
    const q = search.toLowerCase()
    return bauten.filter(b =>
      b.adresse.toLowerCase().includes(q) ||
      (b.hofname ?? '').toLowerCase().includes(q)
    )
  }, [bauten, search])

  // Suggestions (top 8)
  const suggestions = useMemo(() => {
    if (search.trim().length < 2) return [] as BauRow[]
    const q = search.toLowerCase()
    return bauten
      .filter(b => b.adresse.toLowerCase().includes(q) || (b.hofname ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [bauten, search])

  // Single FeatureCollection per layer
  const { polygonsFC, pointsFC } = useMemo(() => {
    const poly: any = { type: 'FeatureCollection', features: [] }
    const pts:  any = { type: 'FeatureCollection', features: [] }
    for (const b of visible) {
      if (b.geom_geojson) {
        poly.features.push({ type: 'Feature', geometry: b.geom_geojson, properties: b })
      }
      if (b.lat != null && b.lon != null) {
        pts.features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
          properties: b,
        })
      }
    }
    return { polygonsFC: poly, pointsFC: pts }
  }, [visible])

  const dataKey = useMemo(
    () => `${visible.length}-${search}`,
    [visible.length, search]
  )

  function flyTo(b: BauRow) {
    setSearch('')
    setShowSuggestions(false)
    if (mapRef.current && b.lat != null && b.lon != null) {
      mapRef.current.flyTo([b.lat, b.lon], 17, { duration: 0.8 })
    }
  }

  return (
    <div className="relative h-[calc(100dvh-52px)] w-full">
      <MapContainer
        center={[48.2082, 16.3738]}
        zoom={12}
        minZoom={10}
        maxZoom={19}
        scrollWheelZoom
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          key={tileKey}
          attribution={TILE_LAYERS[tileKey].attr}
          url={TILE_LAYERS[tileKey].url}
          subdomains={['maps', 'maps1', 'maps2', 'maps3', 'maps4']}
          maxZoom={19}
        />

        {polygonsFC.features.length > 0 && (
          <GeoJSON
            key={`poly-${dataKey}`}
            data={polygonsFC}
            style={(feature: any) => {
              const f: Farbe = feature?.properties?.farb_kategorie ?? 'grau'
              const c = COLORS[f]
              return {
                color: c,
                weight: 1.2,
                opacity: 0.95,
                fillColor: c,
                fillOpacity: f === 'grau' ? 0.25 : 0.45,
              }
            }}
            onEachFeature={bindFeatureHandlers}
          />
        )}

        {pointsFC.features.length > 0 && (
          <GeoJSON
            key={`pts-${dataKey}`}
            data={pointsFC}
            pointToLayer={(feature: any, latlng: L.LatLng) => {
              const f: Farbe = feature?.properties?.farb_kategorie ?? 'grau'
              return L.circleMarker(latlng, {
                radius: 6,
                color: '#111',
                weight: 1,
                fillColor: COLORS[f],
                fillOpacity: f === 'grau' ? 0.6 : 0.95,
              })
            }}
            onEachFeature={bindFeatureHandlers}
          />
        )}

        <MapInit mapRef={mapRef} />
      </MapContainer>

      {/* Top overlay: search + tile switcher */}
      <div className="absolute top-3 inset-x-3 z-[400] flex gap-2 pointer-events-none">
        <div className="flex-1 pointer-events-auto relative">
          <div className="bg-white rounded-xl shadow-lg flex items-center px-3 py-2">
            <span className="text-slate-400 mr-2">🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Adresse oder Hofname …"
              className="bg-transparent outline-none flex-1 text-sm text-slate-800"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setShowSuggestions(false) }}
                className="ml-1 text-slate-400 hover:text-slate-700 text-sm"
                aria-label="Suche zurücksetzen"
              >
                ✕
              </button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl overflow-hidden z-[500] max-h-80 overflow-y-auto">
              {suggestions.map(b => (
                <button
                  key={b.objectid}
                  onMouseDown={() => flyTo(b)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div className="text-sm font-medium text-slate-800">{b.adresse}</div>
                  {b.hofname && <div className="text-xs text-slate-500">{b.hofname}</div>}
                  <div className="text-xs text-slate-400">{b.plz} · Bezirk {b.bezirk}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          value={tileKey}
          onChange={e => setTileKey(e.target.value as TileKey)}
          className="pointer-events-auto bg-white rounded-xl shadow-lg px-3 py-2 text-sm border-0 text-slate-800"
        >
          {(Object.entries(TILE_LAYERS) as [TileKey, typeof TILE_LAYERS[TileKey]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/95 px-3 py-1.5 rounded-md shadow text-sm z-[1000]">
          Lade Gemeindebauten…
        </div>
      )}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-100 text-red-800 px-3 py-1.5 rounded-md shadow text-sm z-[1000] max-w-[90%]">
          Fehler: {error}
        </div>
      )}

      <Legend total={bauten.length} visible={visible.length} />
    </div>
  )
}

// -- Helpers -----------------------------------------------------------------
function bindFeatureHandlers(feature: any, layer: L.Layer) {
  const b = feature.properties as BauRow
  layer.bindTooltip(
    `<strong>${escapeHtml(b.hofname || b.adresse)}</strong><br>${escapeHtml(labelForStatus(b))}`,
    { sticky: true }
  )
  layer.bindPopup(popupHTML(b), { maxWidth: 280 })
  layer.on('click', () => {
    window.location.href = `/bau/${b.objectid}`
  })
}

function MapInit({ mapRef }: { mapRef: { current: L.Map | null } }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    map.fitBounds([[48.118, 16.181], [48.323, 16.578]], { padding: [10, 10] })
  }, [map, mapRef])
  return null
}

function labelForStatus(b: BauRow): string {
  if (b.crawl_status === 'pending') return 'Noch nicht abgefragt'
  const erf = b.tueren_erfasst
  const gas = b.tueren_gas
  const fw  = b.tueren_fw
  const pct = erf ? Math.round((gas / erf) * 100) : 0
  return `${pct}% Gas · ${fw}/${erf} mit Fernwärme`
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

function popupHTML(b: BauRow): string {
  const title = escapeHtml(b.hofname || b.adresse)
  const adresse = escapeHtml(b.adresse)
  const stat = escapeHtml(labelForStatus(b))
  return `
    <div style="font: 13px/1.4 system-ui, sans-serif; min-width: 220px;">
      <div style="font-weight:600;margin-bottom:4px;">${title}</div>
      <div style="color:#555;">${adresse}</div>
      <div style="margin-top:6px;">${stat}</div>
      <div style="margin-top:8px;">
        <a href="/bau/${b.objectid}"
           style="display:inline-block;padding:4px 10px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;">
          Details öffnen
        </a>
      </div>
    </div>`
}

function Legend({ total, visible }: { total: number; visible: number }) {
  const rows: { c: Farbe; label: string }[] = [
    { c: 'grau',      label: 'noch nicht abgefragt' },
    { c: 'gruen',     label: '0 % Gas' },
    { c: 'hellgruen', label: '1–25 % Gas' },
    { c: 'gelb',      label: '26–50 % Gas' },
    { c: 'orange',    label: '51–75 % Gas' },
    { c: 'rot',       label: '76–100 % Gas' },
  ]
  return (
    <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur rounded-lg shadow px-3 py-2 text-xs text-slate-700 z-[400]">
      <div className="font-semibold mb-1">Farb-Kategorien</div>
      <ul className="space-y-0.5">
        {rows.map(r => (
          <li key={r.c} className="flex items-center gap-2">
            <span
              className="inline-block w-3.5 h-3.5 rounded-sm border border-black/20"
              style={{ background: COLORS[r.c] }}
            />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10px] text-slate-500">
        {total
          ? (visible === total
              ? `${total.toLocaleString('de-AT')} Gemeindebauten`
              : `${visible.toLocaleString('de-AT')} von ${total.toLocaleString('de-AT')}`)
          : ''}
      </div>
    </div>
  )
}
