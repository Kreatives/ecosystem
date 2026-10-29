/**
 * Eenmalig: herformatteer bestaande lead-pagina's naar de nette opmaak met
 * berichten. Leest score/onderbouwing uit de pagina, regenereert pijnpunten +
 * berichten, vervangt de pagina-inhoud. Behoudt de bestaande properties/score.
 *
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/reformat-leads.ts <pageId> [pageId...]
 */
import { notion } from '../lib/notion';
import { haalSite } from '../lib/scrape-site';
import { analyseerVolledig } from '../lib/analyse';
import { schrijfBerichten } from '../lib/writer';
import { leadBlocks } from '../lib/notion-write';
import { supabase } from '../lib/supabase';
import type { RawLead } from '../lib/apify';

const titleText = (p: any) => (p?.title || []).map((t: any) => t.plain_text).join('').trim();

async function reformat(pageId: string) {
  const page: any = await notion().pages.retrieve({ page_id: pageId });
  const pr = page.properties;
  const naam = titleText(pr['Lead']);
  const website = pr['Website']?.url || '';
  const score = pr['Score (0-10)']?.number ?? pr['Score']?.number ?? 0;
  const niche = pr['Niche']?.select?.name || 'Overig';
  const platformNaam = pr['Platform']?.select?.name || '';
  const platform = /instagram/i.test(platformNaam) ? 'instagram' : 'linkedin';

  // oude onderbouwing uit de bestaande blokken halen
  const kids: any = await notion().blocks.children.list({ block_id: pageId, page_size: 100 });
  let onderbouwing = '';
  for (const b of kids.results) {
    const txt = (b.paragraph?.rich_text || b.heading_2?.rich_text || [])
      .map((t: any) => t.plain_text)
      .join('');
    if (/PROFIELFIT|KOOPSIGNALEN|WEBSITE/i.test(txt) && txt.length > onderbouwing.length) onderbouwing = txt;
  }

  console.log(`\n→ ${naam} (score ${score}) — analyseren…`);
  const site = website ? await haalSite(website) : { tekst: '', linkedin: '', instagram: '', ok: false };
  const raw: RawLead = { naam, website, bron: 'google-maps' };
  const a = await analyseerVolledig(raw, site.tekst, { score, onderbouwing, niche, skip: false }, niche);
  const berichten = await schrijfBerichten('client', raw, site.tekst, a.compliment, a.pijnpunten, platform as any);

  const q = {
    score, onderbouwing, niche, skip: false,
    compliment: a.compliment, pijnpunten: a.pijnpunten,
    concurrenten: a.concurrenten, loomBullets: a.loomBullets,
    screenshotDesktop: a.screenshotDesktop, screenshotMobiel: a.screenshotMobiel,
  };
  const blocks = leadBlocks('client', raw, q, berichten);
  const sb = supabase();
  if (sb) await sb.from('analyses').upsert({
    page_id: pageId, pijnpunten: a.pijnpunten, compliment: a.compliment, concurrenten: a.concurrenten,
    loom_bullets: a.loomBullets, screenshot_desktop: a.screenshotDesktop, screenshot_mobiel: a.screenshotMobiel,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'page_id' });

  // oude blokken archiveren, nieuwe toevoegen
  for (const b of kids.results) {
    try {
      await notion().blocks.update({ block_id: b.id, archived: true } as any);
    } catch {
      /* al weg */
    }
  }
  // Notion staat max 100 blokken per append toe
  await notion().blocks.children.append({ block_id: pageId, children: blocks as any });
  console.log(`   ✓ ${blocks.length} blokken geschreven, ${berichten.items.length} berichten.`);
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.log('Geef page-ids mee.');
    return;
  }
  for (const id of ids) {
    try {
      await reformat(id);
    } catch (e: any) {
      console.error(`Fout bij ${id}:`, e.message);
    }
  }
  console.log('\nKlaar.');
}

main();
