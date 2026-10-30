import type { DbType } from './env';
import { interpreteerBrief } from './brief';
import { scrapeInstagramSearch, scrapeMaps, screenshot, type RawLead } from './apify';
import { haalSite, haalDoorFilter } from './scrape-site';
import { kwalificeerKlant, kwalificeerPartner, type QualifyResult } from './qualify';
import { maakDedupeChecker, schrijfLead } from './notion-write';
import { emit, type Job } from './jobs';
import { analyseerVolledig } from './analyse';
import { ping } from './anthropic';
import { schrijfBerichten } from './writer';
import { supabase } from './supabase';

export type RunInput = {
  brief: string;
  aantal: number;
  type: DbType;
  platform: 'linkedin' | 'instagram' | 'beide';
  dryRun?: boolean; // test: scrape+kwalificeer maar schrijf niet naar Notion
};

type Kept = { raw: RawLead; q: QualifyResult; site: string };

/** De volledige run. Fouten in één lead stoppen de run nooit: log, sla over, ga door. */
export async function runPipeline(job: Job, input: RunInput): Promise<void> {
  const t0 = Date.now();
  const aantal = Math.max(1, Math.min(50, input.aantal || 10));
  const summary = { gevonden: 0, gekwalificeerd: 0, weggegooid: 0, naarNotion: 0, seconden: 0 };

  try {
    // Preflight: Anthropic moet werken, anders stoppen we vóór we Apify-kosten maken.
    await ping();

    // ---------- 1. SCRAPE ----------
    emit(job, { kind: 'step', key: 'scrape', state: 'active', counter: 'opdracht lezen…' });
    const plan = await interpreteerBrief(input.brief, input.type, input.platform);
    emit(job, { kind: 'log', msg: `Begrepen: ${plan.samenvatting || plan.label}` });

    const maxItems = Math.max(10, aantal * 6);
    const regio = plan.regio;
    const raw: RawLead[] = [];

    for (const bron of plan.sources) {
      try {
        if (bron === 'instagram' && plan.instagramTerms.length) {
          emit(job, { kind: 'log', msg: `Instagram: ${plan.instagramTerms.join(', ')}` });
          raw.push(...(await scrapeInstagramSearch(plan.instagramTerms, Math.max(5, Math.ceil(maxItems / plan.instagramTerms.length)))));
        } else if (bron === 'google-maps' && plan.mapsTerms.length) {
          emit(job, { kind: 'log', msg: `Google Maps: ${plan.mapsTerms.join(', ')}` });
          raw.push(...(await scrapeMaps(plan.mapsTerms, Math.max(3, Math.ceil(maxItems / plan.mapsTerms.length)))));
        }
        emit(job, { kind: 'step', key: 'scrape', state: 'active', counter: `${raw.length} gevonden` });
      } catch (e: any) {
        emit(job, { kind: 'leaderror', key: 'scrape', naam: bron, reden: e?.message || 'scrape-fout' });
      }
    }
    summary.gevonden = raw.length;
    emit(job, { kind: 'step', key: 'scrape', state: 'done', counter: `${raw.length} gevonden` });

    // ---------- 2. QUALIFY ----------
    emit(job, { kind: 'step', key: 'qualify', state: 'active', counter: 'ontdubbelen…' });
    const staatAl = await maakDedupeChecker(input.type);

    const candidates = raw.filter((l) => {
      const f = haalDoorFilter(l, { minVolgers: plan.minVolgers, minReviews: plan.minReviews });
      if (!f.door) return false;
      if (staatAl(l)) return false;
      return true;
    });
    emit(job, { kind: 'log', msg: `${candidates.length} door de filters (van ${raw.length}).` });

    const kept: Kept[] = [];
    let door = 0;
    let weg = 0;
    for (let i = 0; i < candidates.length && kept.length < aantal; i++) {
      const lead = candidates[i];
      try {
        const site = lead.website ? await haalSite(lead.website) : { tekst: '', linkedin: '', instagram: '', ok: false };
        // Outreach-links van de site halen (de bron bij Maps-bedrijven).
        if (site.linkedin && !lead.linkedin) lead.linkedin = site.linkedin;
        if (site.instagram && !lead.instagram) lead.instagram = site.instagram;
        const shot = lead.website ? await screenshot(lead.website) : '';
        const q =
          input.type === 'partner'
            ? await kwalificeerPartner(lead, site.tekst, shot)
            : await kwalificeerKlant(lead, site.tekst, shot, plan.notionNiche, plan.omschrijving);

        if (q.skip) {
          weg++;
          emit(job, { kind: 'log', msg: `✗ ${lead.naam} — ${q.score} (${q.skipReden || 'onder 6'})` });
        } else {
          door++;
          kept.push({ raw: lead, q, site: site.tekst });
          emit(job, { kind: 'log', msg: `✓ ${lead.naam} — ${q.score}` });
        }
      } catch (e: any) {
        emit(job, { kind: 'leaderror', key: 'qualify', naam: lead.naam, reden: e?.message || 'score-fout' });
      }
      emit(job, { kind: 'step', key: 'qualify', state: 'active', counter: `${i + 1} / ${candidates.length} — ${door} door, ${weg} weggegooid` });
    }
    summary.weggegooid = weg;
    summary.gekwalificeerd = door;
    emit(job, { kind: 'step', key: 'qualify', state: 'done', counter: `${door} door, ${weg} weggegooid` });

    // ---------- 3. ANALYSE: volledige website-analyse (pijnpunten, concurrenten, Loom, screenshots) ----------
    emit(job, { kind: 'step', key: 'analyse', state: 'active', counter: input.type === 'partner' ? 'n.v.t. voor partners' : `0 / ${kept.length}` });
    if (input.type === 'client') {
      for (let i = 0; i < kept.length; i++) {
        try {
          if (kept[i].site || kept[i].raw.website) {
            const a = await analyseerVolledig(kept[i].raw, kept[i].site, kept[i].q, plan.notionNiche);
            kept[i].q = { ...kept[i].q, ...a };
            emit(job, { kind: 'log', msg: `${kept[i].raw.naam}: ${a.concurrenten.length} concurrenten, ${a.screenshotDesktop ? 'screenshots ✓' : 'geen screenshots'}` });
          }
        } catch (e: any) {
          emit(job, { kind: 'leaderror', key: 'analyse', naam: kept[i].raw.naam, reden: e?.message || 'analyse-fout' });
        }
        emit(job, { kind: 'step', key: 'analyse', state: 'active', counter: `${i + 1} / ${kept.length}` });
      }
    }
    emit(job, { kind: 'step', key: 'analyse', state: 'done', counter: input.type === 'partner' ? 'n.v.t.' : `${kept.length} geanalyseerd` });

    // ---------- 4. WRITE: berichten schrijven + naar Notion ----------
    emit(job, { kind: 'step', key: 'write', state: 'active', counter: `0 / ${kept.length}` });
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      try {
        const berichten = await schrijfBerichten(
          input.type,
          k.raw,
          k.site,
          k.q.compliment || '',
          k.q.pijnpunten || [],
          input.platform,
        );
        if (!input.dryRun) {
          const pageId = await schrijfLead(input.type, k.raw, k.q, input.platform, berichten);
          summary.naarNotion++;
          // analyse-output spiegelen naar de eigen database (fase 6 gebruikt dit).
          const sb = supabase();
          if (sb) {
            sb.from('analyses').upsert({
              page_id: pageId,
              pijnpunten: k.q.pijnpunten || null,
              compliment: k.q.compliment || null,
              concurrenten: k.q.concurrenten || null,
              loom_bullets: k.q.loomBullets || null,
              screenshot_desktop: k.q.screenshotDesktop || null,
              screenshot_mobiel: k.q.screenshotMobiel || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'page_id' }).then(() => {}, () => {});
          }
        } else {
          emit(job, { kind: 'log', msg: `Dry-run: ${berichten.items.length} berichten voor ${k.raw.naam} (niet weggeschreven).` });
        }
      } catch (e: any) {
        emit(job, { kind: 'leaderror', key: 'write', naam: k.raw.naam, reden: e?.message || 'schrijf-fout' });
      }
      emit(job, { kind: 'step', key: 'write', state: 'active', counter: `${i + 1} / ${kept.length}` });
    }
    emit(job, { kind: 'step', key: 'write', state: 'done', counter: input.dryRun ? 'dry-run' : `${summary.naarNotion} naar Notion` });

    summary.seconden = Math.round((Date.now() - t0) / 1000);

    // Run loggen voor de statistieken (gescrapet/gekwalificeerd per week).
    const sb = supabase();
    if (sb && !input.dryRun) {
      sb.from('scrape_runs').insert({
        id: job.id,
        prompt: input.brief,
        type: input.type,
        platform: input.platform,
        gevonden: summary.gevonden,
        gekwalificeerd: summary.gekwalificeerd,
        weggegooid: summary.weggegooid,
        naar_notion: summary.naarNotion,
      }).then(() => {}, () => {});
    }

    emit(job, { kind: 'done', summary });
  } catch (e: any) {
    emit(job, { kind: 'error', msg: e?.message || 'onbekende fout' });
  }
}
