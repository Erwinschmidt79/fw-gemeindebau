import "./globals.css";
import BottomNav from "./_components/BottomNav";
import { createServerSupabase } from "@/lib/supabase-server";

export const metadata = {
  title: "FW-Gemeindebau · Wiener Verfügbarkeit",
  description: "Strom · Gas · Fernwärme pro Wohneinheit für Wiens Gemeindebauten",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900 min-h-screen pb-20">
        {children}
        {user ? <BottomNav /> : null}
      </body>
    </html>
  );
}
