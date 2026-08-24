import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

/**
 * Service-role client, for the scheduled jobs.
 *
 * A cron run has no session, so it cannot go through RLS the way a request
 * does. This key bypasses RLS entirely and must never reach the browser —
 * it is read from a server-only env var and this module is server-only.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ontbreekt. Zonder die sleutel kunnen de geplande taken niet draaien.',
    );
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Vercel calls a cron route with `Authorization: Bearer $CRON_SECRET`.
 * Without the check the endpoints would be open to anyone who guessed a URL.
 */
export function isAuthorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
