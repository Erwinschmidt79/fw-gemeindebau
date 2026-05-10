'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet'
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
  geom_geojson: GeoJSON.MultiPolygon | null
  tueren_total: number
  tueren_erfasst: number
  tueren_fw: number
  tueren_gas: number
  crawl_status: 'pending' | 'partial' | 'done'
  heating_status: 'unknown' | 'fw' | 'gas' | 'mixed' | 'other'
  farb_kategorie: Farbe
}

// -- Colors (must match the legend) -----------------------------------------
const COLORS: Record<Farbe, string> = {
  grau:      '#9ca3af', // not yet crawled
  gruen:     '#15803d', // 0% Gas
  hellgruen: '#65a30d', // 1–25%
  gelb:      '#eab308', // 26–50%
  orange:    '#ea580c', // 51–75%
  rot:       '#b91c1c', // 76–100%
}

// -- Component ---------------------------------------------------------------
export default function MapClient() {
  const [bauten, setBauten] = useState<BauRow[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Fetch in chunks of 1000 to defeat PostgREST default row limit
      const PAGE = 1000
      const acc: BauRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('bauten_map')
          .select('*')
          .range(from, from + PAGE - 1)
        if (error) { if (!cancelled) setError(error.message); return }
        if (!data || data.length === 0) break
        acc.push(...(data as BauRow[]))
        if (data.length < PAGE) break
      }
      if (!cancelled) {
        setBauten(acc)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Split into one big GeoJSON FeatureCollection (polygons) and a list for pins
  const { polygonsFC, pins } = useMemo(() => {
    const fc: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, BauRow> = {
      type: 'FeatureCollection',
      features: [],
    }
    const pinsList: BauRow[] = []
    for (const b of bauten) {
      if (b.geom_geojson) {
        fc.features.push({
          type: 'Feature',
          geometry: b.geom_geojson,
          properties: b,
        })
      }
      if (b.lat != null && b.lon != null) pinsList.push(b)
    }
    return { polygonsFC: fc, pins: pinsList }
  }, [bauten])

  const polygonStyle = (feature?: GeoJSON.Feature<GeoJSON.MultiPolygon, BauRow>) => {
    const f = feature?.properties?.farb_kategorie ?? 'grau'
    const c = COLORS[f]
    return {
      color: c,
      weight: 1.2,
      opacity: 0.95,
      fillColor: c,
      fillOpacity: f === 'grau' ? 0.25 : 0.45,
    } as L.PathOptions
  }

  // Stable key so the GeoJSON layer is rebuilt when data changes
  const fcKey = useMemo(
    () => `${polygonsFC.features.length}-${bauten.length}`,
    [polygonsFC, bauten]
  )

  return (
    <div className="relative h-[calc(100dvh-52px)] w-full">
      <MapContainer
        center={[48.2082, 16.3738]}
        zoom={12}
        minZoom={10}
        maxZoom={18}
        scrollWheelZoom
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
        />

        {/* Polygons — every Gemeindebau, always drawn */}
        {polygonsFC.features.length > 0 && (
          <GeoJSON
            key={`poly-${fcKey}`}
            data={polygonsFC}
            style={polygonStyle as any}
            onEachFeature={(feature, layer) => {
              const b = (feature as any).properties as BauRow
              const html = popupHTML(b)
              layer.bindPopup(html, { maxWidth: 280 })
              layer.on('click', () => {
                // Optional: navigate to detail page on second tap
                // window.location.href = `/bau/${b.objectid}`
              })
            }}
          />
        )}

        {/* Pins (CircleMarkers) — colored dot at each centroid */}
        {pins.map(b => (
          <CircleMarker
            key={`pin-${b.objectid}`}
            center={[b.lat, b.lon]}
            radius={6}
            pathOptions={{
              color: '#111',
              weight: 1,
              fillColor: COLORS[b.farb_kategorie],
              fillOpacity: b.farb_kategorie === 'grau' ? 0.6 : 0.95,
            }}
            eventHandlers={{
              click: () => { window.location.href = `/bau/${b.objectid}` },
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <strong>{b.hofname || b.adresse}</strong>
              <br />
              {b.adresse} · {b.wohnungsanzahl ?? '?'} Whg.
              <br />
              {labelForStatus(b)}
            </Tooltip>
          </CircleMarker>
        ))}

        <FitToWien />
      </MapContainer>

      {/* Loading / error overlays */}
      {loading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white/90 px-3 py-1.5 rounded-md shadow text-sm">
          Lade Gemeindebauten…
        </div>
      )}
      {error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-100 text-red-800 px-3 py-1.5 rounded-md shadow text-sm">
          Fehler: {error}
        </div>
      )}

      <Legend total={bauten.length} />
    </div>
  )
}

// -- Helpers -----------------------------------------------------------------
function FitToWien() {
  const map = useMap()
  useEffect(() => {
    // Wien bounding box
    map.fitBounds([[48.118, 16.181], [48.323, 16.578]], { padding: [10, 10] })
  }, [map])
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

function popupHTML(b: BauRow): string {
  const title = (b.hofname || b.adresse).replace(/</g, '&lt;')
  const adresse = b.adresse.replace(/</g, '&lt;')
  const stat = labelForStatus(b).replace(/</g, '&lt;')
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

function Legend({ total }: { total: number }) {
  const rows: { c: Farbe, label: string }[] = [
    { c: 'grau',      label: 'noch nicht abgefragt' },
    { c: 'gruen',     label: '0 % Gas' },
    { c: 'hellgruen', label: '1–25 % Gas' },
    { c: 'gelb',      label: '26–50 % Gas' },
    { c: 'orange',    label: '51–75 % Gas' },
    { c: 'rot',       label: '76–100 % Gas' },
  ]
  return (
    <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur rounded-lg shadow px-3 py-2 text-xs text-slate-700 z-[1000]">
      <div className="font-semibold mb-1">Farb-Kategorien</div>
      <ul className="space-y-0.5">
        {rows.map(r => (
          <li key={r.c} className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-sm border border-black/20"
                  style={{ background: COLORS[r.c] }} />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10px] text-slate-500">{total.toLocaleString('de-AT')} Gemeindebauten</div>
    </div>
  )
}
