/**
 * Chunked, herstartbare run voor de WEB-knop. De oude aanpak (hele pipeline in
 * één `after()`) wordt op Vercel na 300s gekild — te kort voor een echte run
 * (Apify-scrape ~7 min, per-lead Claude-werk, totaal tot ~45 min).
 *
 * Hier knippen we de run in korte brokken. De stand leeft in Supabase
 * (`jobs.progress._wf`), niet in het geheugen van één request. Elke "tick"
 * verwerkt een klein stuk (<~3 min) en trapt daarna de volgende tick af via een
 * interne fetch. De status-poll van de UI heelt een afgebroken keten weer.
 *
 * Het CLI-pad (`lib/run-pipeline.ts`) blijft ongemoeid: dat heeft geen limiet.
 */
import type { DbType } from './env';
import { interpreteerBrief, type Plan } from './brief';
import { startScrape, pollScrape, type RawLead, type ScrapeRef } from './apify';
import { haalSite, haalDoorFilter } from './scrape-site';
import { kwalificeerKlant, kwalificeerPartner } from './qualify';
import { maakDedupeChecker, schrijfLead } from './notion-write';
import { analyseerVolledig } from './analyse';
import { schrijfBerichten } from './writer';
import { screenshot } from './apify';
import { supabase } from './supabase';

export type RunInput = {
  brief: string;
  aantal: number;
  type: DbType;
  platform: 'linkedin' | 'instagram' | 'beide';
  dryRun?: boolean;
};

type StepKey = 'scrape' | 'qualify' | 'analyse' | 'write';
type StepInfo = { state: 'upcoming' | 'active' | 'done'; counter?: string; errors: { naam: string; reden: string }[] };
type Summary = { gevonden: number; gekwalificeerd: number; weggegooid: number; naarNotion: number; seconden: number };

type Wf = {
  phase: 'scraping' | 'processing' | 'done' | 'error';
  input: RunInput;
  plan: Plan;
  refs: ScrapeRef[];
  candidates: RawLead[];
  i: number; // volgende kandidaat-index
  kept: number;
  weg: number;
  naarNotion: number;
  gevonden: number;
  t0: number; // startmoment (ms) voor de seconden-teller
};

type Progress = { brief: string; type: DbType; platform: string; steps: Record<StepKey, StepInfo>; summary: Summary | null; _wf: Wf };

const STEP_KEYS: StepKey[] = ['scrape', 'qualify', 'analyse', 'write'];
const BATCH = 3; // leads per processing-tick
const TICK_BUDGET_MS = 180_000; // stop een tick ruim vóór de 300s-kill
const SCRAPE_POLL_ROUNDS = 3;
const SCRAPE_POLL_SLEEP = 25_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function initSteps(): Record<StepKey, StepInfo> {
  const s = {} as Record<StepKey, StepInfo>;
  for (const k of STEP_KEYS) s[k] = { state: 'upcoming', errors: [] };
  return s;
}

async function logJob(jobId: string, msg: string, level: 'info' | 'warn' = 'info') {
  const sb = supabase();
  if (sb) await sb.from('job_logs').insert({ job_id: jobId, level, msg }).then(() => {}, () => {});
}

async function saveProgress(jobId: string, p: Progress, status: 'running' | 'done' | 'error', summary: Summary | null, error: string | null = null) {
  const sb = supabase();
  if (!sb) return;
  await sb
    .from('jobs')
    .update({ status, progress: p, result: summary, error, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .then(() => {}, () => {});
}

async function loadProgress(jobId: string): Promise<{ status: string; progress: Progress } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.from('jobs').select('status,progress').eq('id', jobId).maybeSingle();
  if (!data) return null;
  return { status: data.status as string, progress: data.progress as Progress };
}

/** Trapt (fire-and-forget) de volgende tick af in een verse serverless-invocatie. */
export async function triggerTick(baseUrl: string, jobId: string): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-run-key': process.env.RUN_TICK_SECRET || '',
  };
  // Als de deployment achter Vercel-protection zit, kan de server zichzelf anders
  // niet aanroepen (401). Met deze bypass-secret wél.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  try {
    await fetch(`${baseUrl}/api/run/tick`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* de status-poll heelt een gemiste keten weer */
  }
}

/** Start een run: job aanmaken, brief lezen, Apify-actors starten, eerste tick.
 *  jobId wordt door de route meegegeven zodat de UI die meteen kan pollen. */
export async function startRun(input: RunInput, baseUrl: string, jobId: string): Promise<string> {
  const steps = initSteps();
  const t0 = now();
  const aantal = Math.max(1, Math.min(50, input.aantal || 10));

  // 1) Rij meteen aanmaken zodat /status niet 404't terwijl we de brief lezen.
  steps.scrape = { state: 'active', counter: 'opdracht lezen…', errors: [] };
  const wf0: Wf = { phase: 'scraping', input: { ...input, aantal }, plan: {} as Plan, refs: [], candidates: [], i: 0, kept: 0, weg: 0, naarNotion: 0, gevonden: 0, t0 };
  const progress0: Progress = { brief: input.brief, type: input.type, platform: input.platform, steps, summary: null, _wf: wf0 };
  const sb = supabase();
  if (sb) await sb.from('jobs').insert({ id: jobId, kind: 'scrape', status: 'running', progress: progress0 }).then(() => {}, () => {});

  // 2) Brief lezen + actors starten (een paar seconden).
  const plan = await interpreteerBrief(input.brief, input.type, input.platform);
  const maxItems = Math.max(10, aantal * 6);
  const refs = await startScrape(plan, maxItems);

  steps.scrape = { state: 'active', counter: refs.length ? 'scrapen gestart…' : 'geen bron', errors: [] };
  const wf: Wf = { ...wf0, plan, refs };
  const progress: Progress = { brief: input.brief, type: input.type, platform: input.platform, steps, summary: null, _wf: wf };
  await saveProgress(jobId, progress, 'running', null);

  await logJob(jobId, `Begrepen: ${plan.samenvatting || plan.label}`);
  if (plan.mapsTerms.length) await logJob(jobId, `Google Maps: ${plan.mapsTerms.join(', ')}`);
  if (plan.instagramTerms.length) await logJob(jobId, `Instagram: ${plan.instagramTerms.join(', ')}`);
  if (!refs.length) await logJob(jobId, 'Geen scrape-bron gekozen — run stopt leeg.', 'warn');

  await triggerTick(baseUrl, jobId);
  return jobId;
}

/** Eén brok werk. Laadt de stand, verwerkt een stuk, bewaart, trapt de volgende af. */
export async function tick(jobId: string, baseUrl: string): Promise<void> {
  const loaded = await loadProgress(jobId);
  if (!loaded || loaded.status !== 'running') return; // klaar, weg of niet van ons
  const p = loaded.progress;
  const wf = p?._wf;
  if (!wf || !wf.phase) return; // geen chunked job

  try {
    if (wf.phase === 'scraping') {
      await tickScrape(jobId, p);
    } else if (wf.phase === 'processing') {
      await tickProcess(jobId, p);
    }
  } catch (e: any) {
    p.steps[currentStep(p._wf)].errors.push({ naam: 'run', reden: e?.message || 'tick-fout' });
    await saveProgress(jobId, p, 'error', null, e?.message || 'onbekende fout');
    return;
  }

  // Doorketenen zolang de run loopt.
  const after = await loadProgress(jobId);
  if (after && after.status === 'running') await triggerTick(baseUrl, jobId);
}

function currentStep(wf: Wf): StepKey {
  if (wf.phase === 'scraping') return 'scrape';
  return 'write';
}

/** Scrape-fase: pollt de Apify-runs. Bij afronden → filter + dedupe → processing. */
async function tickScrape(jobId: string, p: Progress) {
  const wf = p._wf;
  if (!wf.refs.length) {
    // niets te scrapen: meteen afronden
    await finish(jobId, p);
    return;
  }

  let result = await pollScrape(wf.refs);
  for (let r = 0; r < SCRAPE_POLL_ROUNDS && !result.allDone; r++) {
    p.steps.scrape = { state: 'active', counter: `scrapen… (${result.statuses.join(', ').toLowerCase()})`, errors: p.steps.scrape.errors };
    await saveProgress(jobId, p, 'running', null);
    await sleep(SCRAPE_POLL_SLEEP);
    result = await pollScrape(wf.refs);
  }

  if (!result.allDone) {
    // nog bezig: stand bewaren, volgende tick pollt verder
    p.steps.scrape = { state: 'active', counter: `scrapen… (${result.statuses.join(', ').toLowerCase()})`, errors: p.steps.scrape.errors };
    await saveProgress(jobId, p, 'running', null);
    return;
  }

  // Klaar: ruwe leads → filter + ontdubbelen tegen Notion → kandidaten.
  const raw = result.leads;
  wf.gevonden = raw.length;
  p.steps.scrape = { state: 'done', counter: `${raw.length} gevonden`, errors: p.steps.scrape.errors };
  await logJob(jobId, `Scrape klaar: ${raw.length} ruwe leads.`);

  p.steps.qualify = { state: 'active', counter: 'ontdubbelen…', errors: [] };
  await saveProgress(jobId, p, 'running', null);

  const staatAl = await maakDedupeChecker(wf.input.type);
  const candidates = raw.filter((l) => {
    const f = haalDoorFilter(l, { minVolgers: wf.plan.minVolgers, minReviews: wf.plan.minReviews });
    return f.door && !staatAl(l);
  });
  wf.candidates = candidates;
  wf.i = 0;
  wf.phase = 'processing';
  await logJob(jobId, `${candidates.length} door de filters (van ${raw.length}).`);

  p.steps.qualify = { state: 'active', counter: `0 / ${candidates.length}`, errors: [] };
  p.steps.analyse = { state: wf.input.type === 'partner' ? 'done' : 'upcoming', counter: wf.input.type === 'partner' ? 'n.v.t.' : `0 / ${wf.input.aantal}`, errors: [] };
  p.steps.write = { state: 'upcoming', counter: `0 / ${wf.input.aantal}`, errors: [] };
  await saveProgress(jobId, p, 'running', null);
}

/** Processing-fase: verwerk tot BATCH leads volledig (site → qualify → analyse →
 *  bericht → Notion). Stopt op tijd of als het doelaantal bereikt is. */
async function tickProcess(jobId: string, p: Progress) {
  const wf = p._wf;
  const started = now();
  let gedaan = 0;

  while (
    wf.i < wf.candidates.length &&
    wf.kept < wf.input.aantal &&
    gedaan < BATCH &&
    now() - started < TICK_BUDGET_MS
  ) {
    const lead = wf.candidates[wf.i];
    wf.i++;
    gedaan++;
    try {
      await verwerkEen(jobId, wf, lead);
    } catch (e: any) {
      p.steps.write.errors.push({ naam: lead.naam, reden: e?.message || 'verwerk-fout' });
      await logJob(jobId, `${lead.naam}: ${e?.message || 'verwerk-fout'}`, 'warn');
    }

    p.steps.qualify = { state: 'active', counter: `${wf.i} / ${wf.candidates.length} — ${wf.kept} door, ${wf.weg} weggegooid`, errors: p.steps.qualify.errors };
    if (wf.input.type === 'client') p.steps.analyse = { state: 'active', counter: `${wf.kept} geanalyseerd`, errors: p.steps.analyse.errors };
    p.steps.write = { state: 'active', counter: wf.input.dryRun ? `${wf.kept} (dry-run)` : `${wf.naarNotion} naar Notion`, errors: p.steps.write.errors };
    await saveProgress(jobId, p, 'running', null);
  }

  const klaar = wf.i >= wf.candidates.length || wf.kept >= wf.input.aantal;
  if (klaar) {
    await finish(jobId, p);
  } else {
    await saveProgress(jobId, p, 'running', null);
  }
}

/** Verwerkt één lead volledig. Werkt de wf-tellers bij. */
async function verwerkEen(jobId: string, wf: Wf, lead: RawLead) {
  const site = lead.website ? await haalSite(lead.website) : { tekst: '', linkedin: '', instagram: '', ok: false };
  if (site.linkedin && !lead.linkedin) lead.linkedin = site.linkedin;
  if (site.instagram && !lead.instagram) lead.instagram = site.instagram;
  const shot = lead.website ? await screenshot(lead.website) : '';

  let q =
    wf.input.type === 'partner'
      ? await kwalificeerPartner(lead, site.tekst, shot)
      : await kwalificeerKlant(lead, site.tekst, shot, wf.plan.notionNiche, wf.plan.omschrijving);

  if (q.skip) {
    wf.weg++;
    await logJob(jobId, `✗ ${lead.naam} — ${q.score} (${q.skipReden || 'onder 6'})`);
    return;
  }

  // Volledige analyse (alleen klanten, net als de CLI-pipeline).
  if (wf.input.type === 'client' && (site.tekst || lead.website)) {
    try {
      const a = await analyseerVolledig(lead, site.tekst, q, wf.plan.notionNiche);
      q = { ...q, ...a };
    } catch {
      /* analyse is optioneel; ga door */
    }
  }

  const berichten = await schrijfBerichten(wf.input.type, lead, site.tekst, q.compliment || '', q.pijnpunten || [], wf.input.platform);

  wf.kept++;
  if (!wf.input.dryRun) {
    const pageId = await schrijfLead(wf.input.type, lead, q, wf.input.platform, berichten);
    wf.naarNotion++;
    const sb = supabase();
    if (sb) {
      sb.from('analyses')
        .upsert(
          {
            page_id: pageId,
            pijnpunten: q.pijnpunten || null,
            compliment: q.compliment || null,
            concurrenten: q.concurrenten || null,
            loom_bullets: q.loomBullets || null,
            screenshot_desktop: q.screenshotDesktop || null,
            screenshot_mobiel: q.screenshotMobiel || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'page_id' },
        )
        .then(() => {}, () => {});
    }
  }
  await logJob(jobId, `✓ ${lead.naam} — ${q.score}`);
}

/** Rondt de run af: tellers, stappen op 'done', summary en scrape_runs-log. */
async function finish(jobId: string, p: Progress) {
  const wf = p._wf;
  wf.phase = 'done';
  const summary: Summary = {
    gevonden: wf.gevonden,
    gekwalificeerd: wf.kept,
    weggegooid: wf.weg,
    naarNotion: wf.naarNotion,
    seconden: Math.round((now() - wf.t0) / 1000),
  };
  p.steps.scrape = { ...p.steps.scrape, state: 'done' };
  p.steps.qualify = { state: 'done', counter: `${wf.kept} door, ${wf.weg} weggegooid`, errors: p.steps.qualify.errors };
  p.steps.analyse = { state: 'done', counter: wf.input.type === 'partner' ? 'n.v.t.' : `${wf.kept} geanalyseerd`, errors: p.steps.analyse.errors };
  p.steps.write = { state: 'done', counter: wf.input.dryRun ? 'dry-run' : `${wf.naarNotion} naar Notion`, errors: p.steps.write.errors };
  p.summary = summary;

  await saveProgress(jobId, p, 'done', summary);

  const sb = supabase();
  if (sb && !wf.input.dryRun) {
    sb.from('scrape_runs')
      .insert({
        id: jobId,
        prompt: wf.input.brief,
        type: wf.input.type,
        platform: wf.input.platform,
        gevonden: summary.gevonden,
        gekwalificeerd: summary.gekwalificeerd,
        weggegooid: summary.weggegooid,
        naar_notion: summary.naarNotion,
      })
      .then(() => {}, () => {});
  }
}
