import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role Supabase client for server-side writes (bypasses RLS). */
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
