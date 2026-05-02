'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/",       label: "Karte",   icon: "🗺️" },
  { href: "/daten",  label: "Daten",   icon: "📋" },
  { href: "/jobs",   label: "Jobs",    icon: "⏳" },
  { href: "/upload", label: "Upload",  icon: "📁" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-200 z-[1000] safe-bottom">
      <ul className="grid grid-cols-4 max-w-2xl mx-auto">
        {items.map(it => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link href={it.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                  active ? "text-[var(--brand)] font-semibold" : "text-slate-500"
                }`}>
                <span className="text-lg leading-none">{it.icon}</span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
