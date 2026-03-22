import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

let _client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
