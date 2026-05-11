// lib/supabase.ts
// Using '' as fallback prevents build-time crash when env-vars are not yet
// inlined (Next.js 15 renders client-component shells server-side).
// Actual supabase calls only run in the browser (inside useEffect), so
// the empty-string client is never actually used for network requests.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL       ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ?? "placeholder"
  );
}
