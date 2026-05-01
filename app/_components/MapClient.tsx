'use client';
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] grid place-items-center text-slate-400 text-sm">
      Karte wird geladen…
    </div>
  ),
});

export default function MapClient() {
  return <MapView />;
}
