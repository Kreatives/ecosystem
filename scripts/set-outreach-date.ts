/**
 * Zet "Outreach gemaakt" = een datum voor alle klant-leads waarvoor de outreach
 * is gemaakt (= de pagina heeft een "Berichten"-sectie). Geen Claude-tokens nodig.
 *
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/set-outreach-date.ts 2026-10-31
 */
import { notion } from '../lib/notion';
import { env } from '../lib/env';

const DATUM = process.argv[2] || '2026-10-31';

async function heeftBerichten(pageId: string): Promise<boolean> {
  try {
    const res: any = await notion().blocks.children.list({ block_id: pageId, page_size: 100 });
    return res.results.some(
      (b: any) => b.type === 'heading_2' && (b.heading_2?.rich_text || []).map((t: any) => t.plain_text).join('').startsWith('Berichten'),
    );
  } catch {
    return false;
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (idx < items.length) await fn(items[idx++]);
    }),
  );
}

async function main() {
  // alle klant-leads ophalen
  const pages: { id: string; naam: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({ database_id: env.clientsDb, page_size: 100, start_cursor: cursor });
    for (const p of res.results) pages.push({ id: p.id, naam: (p.properties['Lead']?.title || []).map((t: any) => t.plain_text).join('') });
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`${pages.length} klant-leads. Controleren op outreach en datum zetten op ${DATUM}…\n`);

  let gezet = 0;
  await pool(pages, 2, async (p) => {
    if (!(await heeftBerichten(p.id))) return;
    try {
      await notion().pages.update({ page_id: p.id, properties: { 'Outreach gemaakt': { date: { start: DATUM } } } as any });
      gezet++;
      console.log(`  ✓ ${p.naam}`);
    } catch (e: any) {
      console.log(`  ✗ ${p.naam} — ${e?.message || e}`);
    }
  });

  console.log(`\nKlaar. ${gezet} leads op "Outreach gemaakt" = ${DATUM} gezet.`);
}

main().catch((e) => {
  console.error('Mislukt:', e.message);
  process.exit(1);
});
