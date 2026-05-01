'use client';
import { useEffect, useRef } from "react";
import L from "leaflet";

export default function MiniMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, {
      center: [lat, lon],
      zoom: 17,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false,
    });
    L.tileLayer(
      "https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png",
      { maxZoom: 19, subdomains: ["", "1", "2", "3", "4"] }
    ).addTo(map);
    L.marker([lat, lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="bau-marker fw large"></div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      })
    }).addTo(map).bindTooltip(label, { permanent: false });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lon, label]);

  return <div ref={ref} className="leaflet-container fullbleed" />;
}
