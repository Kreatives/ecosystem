/**
 * Zoekt klant-leads waarvan de outreach kale placeholders bevat ({compliment} of
 * {observatie + consequentie} in Day 2) en doet alleen die opnieuw. Gebruik dit
 * nadat je Anthropic-tegoed is aangevuld.
 *
 * Tip (goedkoop): zet vooraf env-vars:
 *   ANALYSE_CONCURRENTEN=0   (concurrenten-web-search uit, scheelt het meest)
 *   ANTHROPIC_MODEL=claude-haiku-4-5-20251001   (Haiku i.p.v. Sonnet)
 *
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/redo-blank.ts [aantal] [concurrency]
 */
import { notion } from '../lib/notion';
import { env } from '../lib/env';
import { reformat } from './reformat-leads';

const titleText = (p: any) => (p?.title || []).map((t: any) => t.plain_text).join('').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isBlank(pageId: string): Promise<boolean> {
  try {
    const res: any = await notion().blocks.children.list({ block_id: pageId, page_size: 100 });
    const blocks = res.results;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'heading_3' && (b.heading_3?.rich_text || []).map((t: any) => t.plain_text).join('').startsWith('Day 2')) {
        const nx = blocks[i + 1];
        const txt = (nx?.[nx?.type]?.rich_text || []).map((t: any) => t.plain_text).join('');
        return txt.includes('{compliment') || txt.includes('{observatie');
      }
    }
  } catch {
    /* overslaan */
  }
  return false;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) await fn(items[idx++]);
  }));
}

async function main() {
  const aantal = Math.max(1, Math.min(200, Number(process.argv[2]) || 60));
  const concurrency = Math.max(1, Math.min(4, Number(process.argv[3]) || 2));

  // scan (rustig, om Notion-rate-limits te respecteren)
  const blanks: { id: string; naam: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({ database_id: env.clientsDb, page_size: 100, start_cursor: cursor });
    for (const p of res.results) {
      if (blanks.length >= aantal) break;
      if (await isBlank(p.id)) blanks.push({ id: p.id, naam: titleText(p.properties['Lead']) });
      await sleep(120);
    }
    cursor = res.has_more && blanks.length < aantal ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`${blanks.length} leads met kale placeholders gevonden. Opnieuw analyseren (concurrency ${concurrency}).\n`);
  let ok = 0, fout = 0;
  await pool(blanks, concurrency, async (l) => {
    try {
      await reformat(l.id);
      ok++;
      console.log(`[${ok + fout}/${blanks.length}] ✓ ${l.naam}`);
    } catch (e: any) {
      fout++;
      console.log(`[${ok + fout}/${blanks.length}] ✗ ${l.naam} — ${e?.message || e}`);
    }
  });
  console.log(`\nKlaar. ${ok} opnieuw gevuld, ${fout} mislukt (vaak IG-leads zonder leesbare site).`);
}

main().catch((e) => { console.error('Mislukt:', e.message); process.exit(1); });
