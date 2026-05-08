// app/page.tsx
import Link from "next/link";
import MapClientWrapper from "./_components/MapClientWrapper";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (
    <div>
      <header className="hero-dark text-white px-4 pt-3 pb-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-blue-300/80">FW-Gemeindebau · Wien</div>
            <h1 className="text-base font-bold">Verfügbarkeits-Karte</h1>
          </div>
          <Link href="/abfrage"
            className="bg-[var(--brand-light)] hover:bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
            + Abfrage
          </Link>
        </div>
      </header>
      <MapClientWrapper />
    </div>
  );
}
