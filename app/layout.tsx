import "./globals.css";
import BottomNav from "./_components/BottomNav";

export const metadata = {
  title: "FW-Gemeindebau · Wiener Verfügbarkeit",
  description: "Strom · Gas · Fernwärme pro Wohneinheit für Wiens Gemeindebauten",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900 min-h-screen pb-20">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
