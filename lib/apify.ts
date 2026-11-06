import { ApifyClient } from 'apify-client';
import { env } from './env';

let _client: ApifyClient | null = null;
function client(): ApifyClient {
  if (!env.apify) throw new Error('APIFY_TOKEN ontbreekt.');
  if (!_client) _client = new ApifyClient({ token: env.apify });
  return _client;
}

export type RawLead = {
  naam: string;
  contactpersoon?: string;
  rol?: string;
  website: string;
  linkedin?: string;
  instagram?: string;
  plaats?: string;
  categorie?: string;
  medewerkers?: number | null;
  oprichtingsjaar?: number | null;
  volgers?: number;
  bio?: string;
  reviewScore?: number | null;
  reviewAantal?: number;
  bron: 'google-maps' | 'instagram' | 'linkedin' | 'deepapi';
};

const MAPS_ACTOR = 'compass/crawler-google-places';
const IG_ACTOR = 'apify/instagram-search-scraper';

function mapsInput(queries: string[], perQuery: number) {
  return {
    searchStringsArray: queries,
    maxCrawledPlacesPerSearch: perQuery,
    language: 'nl',
    countryCode: 'nl',
    skipClosedPlaces: true,
    scrapePlaceDetailPage: true,
  };
}

function mapMaps(items: any[]): RawLead[] {
  return items.map((p) => ({
    naam: p.title as string,
    website: (p.website as string) || '',
    plaats: (p.city as string) || '',
    categorie: (p.categoryName as string) || '',
    reviewScore: (p.totalScore as number) ?? null,
    reviewAantal: (p.reviewsCount as number) ?? 0,
    bron: 'google-maps' as const,
  }));
}

function igInput(searchTerms: string[], perTerm: number) {
  return { search: searchTerms.join(', '), searchType: 'user', searchLimit: perTerm };
}

function mapIg(items: any[]): RawLead[] {
  const gezien = new Set<string>();
  const leads: RawLead[] = [];
  for (const p of items) {
    const username = p.username as string;
    if (!username || gezien.has(username)) continue;
    gezien.add(username);
    leads.push({
      naam: (p.fullName as string) || username,
      website: (p.externalUrl as string) || '',
      instagram: (p.url as string) || `https://www.instagram.com/${username}/`,
      plaats: '',
      categorie: (p.businessCategoryName as string) || '',
      volgers: (p.followersCount as number) ?? 0,
      bio: (p.biography as string) || '',
      bron: 'instagram' as const,
    });
  }
  return leads;
}

async function run(actor: string, input: any, memory = 1024): Promise<any[]> {
  const started = await client().actor(actor).call(input, { memory });
  const { items } = await client().dataset(started.defaultDatasetId).listItems();
  return items as any[];
}

export async function scrapeMaps(queries: string[], perQuery: number): Promise<RawLead[]> {
  return mapMaps(await run(MAPS_ACTOR, mapsInput(queries, perQuery)));
}

export async function scrapeInstagramSearch(searchTerms: string[], perTerm: number): Promise<RawLead[]> {
  if (!searchTerms.length) return [];
  return mapIg(await run(IG_ACTOR, igInput(searchTerms, perTerm)));
}

// ---- Niet-blokkerend scrapen (voor de chunked web-run die de 300s-limiet moet
//      overleven): start de actors, poll ze later, haal pas de items op als klaar. ----
export type Source = 'google-maps' | 'instagram';
export type ScrapeRef = { source: Source; runId: string; datasetId: string; term: string };

type ScrapePlan = { sources: Source[]; mapsTerms: string[]; instagramTerms: string[] };

/** Start de scrape-actors zonder op ze te wachten. Geeft run-referenties terug. */
export async function startScrape(plan: ScrapePlan, maxItems: number): Promise<ScrapeRef[]> {
  const refs: ScrapeRef[] = [];
  for (const bron of plan.sources) {
    if (bron === 'instagram' && plan.instagramTerms.length) {
      const perTerm = Math.max(5, Math.ceil(maxItems / plan.instagramTerms.length));
      const r: any = await client().actor(IG_ACTOR).start(igInput(plan.instagramTerms, perTerm));
      refs.push({ source: 'instagram', runId: r.id, datasetId: r.defaultDatasetId, term: plan.instagramTerms.join(', ') });
    } else if (bron === 'google-maps' && plan.mapsTerms.length) {
      const perQuery = Math.max(3, Math.ceil(maxItems / plan.mapsTerms.length));
      const r: any = await client().actor(MAPS_ACTOR).start(mapsInput(plan.mapsTerms, perQuery), { memory: 1024 });
      refs.push({ source: 'google-maps', runId: r.id, datasetId: r.defaultDatasetId, term: plan.mapsTerms.join(', ') });
    }
  }
  return refs;
}

/** Pollt lopende scrape-runs. allDone = alle runs in een eindtoestand; leads =
 *  de verzamelde resultaten van de geslaagde runs (alleen zinvol als allDone). */
export async function pollScrape(refs: ScrapeRef[]): Promise<{ allDone: boolean; leads: RawLead[]; statuses: string[] }> {
  const statuses: string[] = [];
  const leads: RawLead[] = [];
  let allDone = true;
  for (const ref of refs) {
    const r: any = await client().run(ref.runId).get();
    const status = (r?.status as string) || 'UNKNOWN';
    statuses.push(status);
    const terminal = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'].includes(status);
    if (!terminal) {
      allDone = false;
      continue;
    }
    if (status === 'SUCCEEDED') {
      const { items } = await client().dataset(ref.datasetId).listItems();
      leads.push(...(ref.source === 'google-maps' ? mapMaps(items as any[]) : mapIg(items as any[])));
    }
  }
  return { allDone, leads, statuses };
}

export async function scrapeLinkedinSearch(opts: {
  searchQuery?: string;
  locations?: string[];
  maxItems: number;
}): Promise<RawLead[]> {
  const items = await run('harvestapi/linkedin-profile-search', {
    profileScraperMode: 'Full',
    searchQuery: opts.searchQuery || undefined,
    locations: opts.locations?.length ? opts.locations : undefined,
    maxItems: opts.maxItems,
  });
  return items.map((p: any) => {
    const contact =
      p.name || p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.publicIdentifier || '';
    const linkedin =
      p.linkedinUrl || p.profileUrl || p.url || (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier}/` : '');
    const bedrijf = p.currentCompany?.name || p.companyName || p.company || '';
    const rol = p.headline || p.currentPosition?.title || p.jobTitle || '';
    const plaats = p.location?.linkedinText || p.location || p.locationName || '';
    const website = p.currentCompany?.website || p.website || '';
    return {
      naam: (bedrijf || contact || 'Onbekend') as string,
      contactpersoon: (contact as string) || '',
      rol: (rol as string) || '',
      website: (website as string) || '',
      linkedin: (linkedin as string) || '',
      plaats: (typeof plaats === 'string' ? plaats : '') as string,
      categorie: (rol as string) || '',
      bron: 'linkedin' as const,
    };
  });
}

/** Screenshot van de homepage via een Apify-actor (optioneel). */
export async function screenshot(url: string): Promise<string> {
  const actor = process.env.SCREENSHOT_ACTOR || '';
  if (!actor || !url) return '';
  try {
    const items = await run(actor, { link_urls: [{ url }], fullPage: false, window_Width: 1440 });
    const first = items[0] || {};
    const candidate = Object.values(first).find(
      (v) => typeof v === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp)/i.test(v as string),
    );
    return (candidate as string) || '';
  } catch {
    return '';
  }
}
