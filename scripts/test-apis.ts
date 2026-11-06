/**
 * Preflight: test of alle externe APIs bereikbaar zijn en de sleutels geldig.
 * Goedkoop — geen dure Apify-actor runs, alleen auth/read checks.
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/test-apis.ts
 */
import { env } from '../lib/env';
import { notion } from '../lib/notion';
import { ping, MODEL } from '../lib/anthropic';
import { supabase } from '../lib/supabase';

type Result = { naam: string; ok: boolean; detail: string };
const results: Result[] = [];
const ok = (naam: string, detail: string) => results.push({ naam, ok: true, detail });
const fout = (naam: string, detail: string) => results.push({ naam, ok: false, detail });

async function testNotion() {
  if (!env.notionToken) return fout('Notion', 'NOTION_TOKEN ontbreekt');
  try {
    const n = notion();
    const clients: any = await n.databases.retrieve({ database_id: env.clientsDb });
    const partners: any = await n.databases.retrieve({ database_id: env.partnersDb });
    const title = (d: any) => (d.title || []).map((t: any) => t.plain_text).join('') || '(geen titel)';
    ok('Notion', `Clients-db "${title(clients)}" + Partners-db "${title(partners)}" bereikbaar`);
  } catch (e: any) {
    fout('Notion', `${e?.status || ''} ${e?.message || e}`.trim());
  }
}

async function testAnthropic() {
  if (!env.anthropic) return fout('Anthropic', 'ANTHROPIC_API_KEY ontbreekt');
  try {
    await ping();
    ok('Anthropic', `sleutel geldig, model ${MODEL} reageert`);
  } catch (e: any) {
    fout('Anthropic', e?.message || String(e));
  }
}

async function testApify() {
  if (!env.apify) return fout('Apify', 'APIFY_TOKEN ontbreekt');
  try {
    const res = await fetch('https://api.apify.com/v2/users/me', {
      headers: { Authorization: `Bearer ${env.apify}` },
    });
    if (!res.ok) return fout('Apify', `HTTP ${res.status} — token ongeldig?`);
    const body: any = await res.json();
    const u = body?.data || {};
    ok('Apify', `ingelogd als "${u.username || u.id || 'onbekend'}"${u.plan?.id ? ` (plan ${u.plan.id})` : ''}`);
  } catch (e: any) {
    fout('Apify', e?.message || String(e));
  }
}

async function testSupabase() {
  const sb = supabase();
  if (!sb) return fout('Supabase', 'SUPABASE_URL of SUPABASE_SECRET_KEY ontbreekt');
  try {
    const { error, count } = await sb.from('events').select('*', { count: 'exact', head: true });
    if (error) return fout('Supabase', `verbinding ok maar query faalde: ${error.message}`);
    ok('Supabase', `verbonden, tabel "events" leesbaar (${count ?? 0} rijen)`);
  } catch (e: any) {
    fout('Supabase', e?.message || String(e));
  }
}

async function main() {
  console.log('APIs testen...\n');
  await Promise.all([testNotion(), testAnthropic(), testApify(), testSupabase()]);
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'}  ${r.naam.padEnd(10)} ${r.detail}`);
  }
  const falen = results.filter((r) => !r.ok);
  console.log(`\n${results.length - falen.length}/${results.length} werken.`);
  if (falen.length) process.exit(1);
}

main().catch((e) => { console.error('Testrunner crashte:', e); process.exit(1); });
