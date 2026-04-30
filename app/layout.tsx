// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Fernwärme-Auswertung Wiener Gemeindebauten",
  description: "Verfügbarkeitsabfrage Strom/Gas/Fernwärme pro Wohneinheit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900 min-h-screen">{children}</body>
    </html>
  );
}
