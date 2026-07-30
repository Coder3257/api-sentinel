/**
 * lib/supabase/client.ts
 *
 * Server-only Supabase client using the service role key.
 * Service role bypasses RLS — never expose this key to the browser.
 *
 * Call getSupabaseClient() inside server functions / route handlers.
 * Do NOT import this file from any client component.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client initialised with the service role key.
 * Reuses the same instance across calls within a warm serverless invocation.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  _client = createClient(url, key, {
    auth: {
      // Service role client — disable session persistence entirely.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _client;
}
