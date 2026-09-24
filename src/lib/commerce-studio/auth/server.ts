import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { allowedStudioOwner, studioAuthConfig } from "./config";

export async function createStudioAuthClient() {
  const config = studioAuthConfig();
  if (!config.ready) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) => {
        try { entries.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot set; scoped proxy refreshes cookies. */ }
      }
    }
  });
}

export async function readStudioOwner() {
  const client = await createStudioAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return allowedStudioOwner(data.user, studioAuthConfig().subjects);
}
