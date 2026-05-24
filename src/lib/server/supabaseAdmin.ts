import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseConfigurationError extends Error {
  constructor(message = "Supabase repository adapter requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.") {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseConfigStatus() {
  return {
    supabase_url_configured: Boolean(process.env.SUPABASE_URL),
    supabase_service_role_configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new SupabaseConfigurationError();
  }

  cachedClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return cachedClient;
}

export function resetSupabaseAdminClientForTests() {
  cachedClient = null;
}
