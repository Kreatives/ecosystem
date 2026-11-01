/**
 * Doet alle klant-leads met een "Berichten"-sectie opnieuw in de nieuwe berichtstijl
 * ("Ik zag dat [sterk punt], maar [de site laat dat niet zien]"). Goedkoop als je
 * ANALYSE_CONCURRENTEN=0 zet (geen web search / concurrenten).
 *
 * Draaien: set -a; source .env.local; set +a; ANALYSE_CONCURRENTEN=0 npx tsx scripts/redo-style.ts [concurrency]
 */
import { notion } from '../lib/notion';
import { env } from '../lib/env';
import { reformat } from './reformat-leads';

const titleText = (p: any) => (p?.title || []).map((t: any) => t.plain_text).join('').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) await fn(items[idx++]);
  }));
}

async function main() {
  const concurrency = Math.max(1, Math.min(4, Number(process.argv[2]) || 2));

  const todo: { id: string; naam: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({ database_id: env.clientsDb, page_size: 100, start_cursor: cursor });
    for (const p of res.results) {
      if (await heeftBerichten(p.id)) todo.push({ id: p.id, naam: titleText(p.properties['Lead']) });
      await sleep(120);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`${todo.length} leads met berichten. Opnieuw in de nieuwe stijl (concurrency ${concurrency})${process.env.ANALYSE_CONCURRENTEN === '0' ? ', zonder web search' : ''}.\n`);
  let ok = 0, fout = 0;
  await pool(todo, concurrency, async (l) => {
    try {
      await reformat(l.id);
      ok++;
      console.log(`[${ok + fout}/${todo.length}] ✓ ${l.naam}`);
    } catch (e: any) {
      fout++;
      console.log(`[${ok + fout}/${todo.length}] ✗ ${l.naam} — ${e?.message || e}`);
    }
  });
  console.log(`\nKlaar. ${ok} opnieuw gedaan, ${fout} mislukt.`);
}

main().catch((e) => { console.error('Mislukt:', e.message); process.exit(1); });
