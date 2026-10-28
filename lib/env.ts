/**
 * Centrale configuratie. Alle sleutels komen uit de omgeving (.env.local lokaal,
 * Vercel env in productie). Nooit een sleutel in code.
 *
 * Twee Notion-databases zijn de bron van waarheid:
 *   - Clients:  "Outreach (Clients)"
 *   - Partners: "Outreach (Partners)"
 * De eigen Postgres (Supabase) bevat alleen spiegel/event-log/jobs, geen leaddata.
 */

function clean(id: string | undefined): string {
  // Notion-id's mogen met of zonder streepjes; de API accepteert beide.
  return (id || '').trim();
}

export const env = {
  notionToken: process.env.NOTION_TOKEN || '',
  clientsDb: clean(process.env.NOTION_CLIENTS_DATABASE_ID || process.env.NOTION_DATABASE_ID),
  partnersDb: clean(process.env.NOTION_PARTNER_DATABASE_ID),

  anthropic: process.env.ANTHROPIC_API_KEY || '',
  apify: process.env.APIFY_TOKEN || '',
  deepApi: process.env.DEEPAPI_API_KEY || '',

  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  // Secret key (nieuw: sb_secret_...), of de oude service-role-JWT. Alleen
  // server-side, nooit naar de client. Negeert RLS, dus houd 'm geheim.
  supabaseKey:
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    '',

  minScore: Number(process.env.MIN_SCORE || 6),
};

export type DbType = 'client' | 'partner';

export function dbIdFor(type: DbType): string {
  return type === 'partner' ? env.partnersDb : env.clientsDb;
}

export function assertNotion() {
  if (!env.notionToken) throw new Error('NOTION_TOKEN ontbreekt in de omgeving.');
  if (!env.clientsDb) throw new Error('NOTION_CLIENTS_DATABASE_ID (of NOTION_DATABASE_ID) ontbreekt.');
  if (!env.partnersDb) throw new Error('NOTION_PARTNER_DATABASE_ID ontbreekt.');
}

export const hasSupabase = () => Boolean(env.supabaseUrl && env.supabaseKey);
