/**
 * Zet de volledige analyse + berichten in Notion voor N klant-leads die nu op
 * "Nog niet gestart" staan en een website hebben. Verwerkt met beperkte
 * concurrency zodat het behapbaar blijft. Elke klare lead staat meteen in Notion.
 *
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/batch-analyse.ts [aantal]
 */
import { notion } from '../lib/notion';
import { env } from '../lib/env';
import { reformat } from './reformat-leads';

const titleText = (p: any) => (p?.title || []).map((t: any) => t.plain_text).join('').trim();

/** Heeft de pagina al een "Berichten"-sectie (dus al geanalyseerd)? */
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

/** Kanban "Nog niet gestart" = geen enkele funnel-checkbox aan. Plus: website aanwezig
 *  en nog geen berichten in de pagina. */
async function nogNietGestartMetSite(limit: number): Promise<{ id: string; naam: string }[]> {
  const FUNNEL = ['Sent', 'Opened', 'Replied', 'Gesprek', 'Booked', 'Closed'];
  const out: { id: string; naam: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({
      database_id: env.clientsDb,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        and: [
          { property: 'Website', url: { is_not_empty: true } },
          ...FUNNEL.map((f) => ({ property: f, checkbox: { equals: false } })),
        ],
      },
    });
    for (const p of res.results) {
      if (out.length >= limit) return out;
      if (await heeftBerichten(p.id)) continue; // al gedaan, overslaan
      out.push({ id: p.id, naam: titleText(p.properties['Lead']) });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** Simpele concurrency-pool. */
async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const aantal = Math.max(1, Math.min(200, Number(process.argv[2]) || 50));
  const concurrency = Math.max(1, Math.min(6, Number(process.argv[3]) || 4));
  const leads = await nogNietGestartMetSite(aantal);
  console.log(`Gevonden: ${leads.length} nog-niet-gestarte klant-leads met website. Start analyse (concurrency ${concurrency}).\n`);

  let klaar = 0;
  let fout = 0;
  await pool(leads, concurrency, async (lead) => {
    try {
      await reformat(lead.id);
      klaar++;
      console.log(`[${klaar + fout}/${leads.length}] ✓ ${lead.naam}`);
    } catch (e: any) {
      fout++;
      console.log(`[${klaar + fout}/${leads.length}] ✗ ${lead.naam} — ${e?.message || e}`);
    }
  });

  console.log(`\nKlaar. ${klaar} gelukt, ${fout} mislukt.`);
}

main().catch((e) => {
  console.error('Batch mislukt:', e.message);
  process.exit(1);
});
