import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabase } from './env';

let _sb: SupabaseClient | null = null;

/**
 * Server-side Supabase-client (service-role). Geeft null terug als Supabase nog
 * niet is geconfigureerd, zodat fase 1 (Kanban/sync tegen Notion) ook werkt
 * voordat de Postgres-sleutels zijn ingevuld. Event-log en statistieken hebben
 * Supabase wel nodig.
 */
export function supabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!_sb) {
    _sb = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}
