import { Client } from '@notionhq/client';
import { env, dbIdFor, assertNotion, type DbType } from './env';
import { propsFor, funnelFor, type StatusValue } from './notion-schema';
import { columnFromChecks } from './kanban';
import type { Lead } from './types';

let _client: Client | null = null;
export function notion(): Client {
  if (!_client) {
    assertNotion();
    _client = new Client({ auth: env.notionToken });
  }
  return _client;
}

const titleText = (p: any): string =>
  (p?.title || []).map((t: any) => t.plain_text).join('').trim();

/** Leest één Notion-pagina uit en mapt hem naar het Lead-schema van de app. */
export function pageToLead(type: DbType, page: any): Lead {
  const P = propsFor(type);
  const pr = page.properties || {};
  const funnel = funnelFor(type);

  const checks: Record<string, boolean> = {};
  for (const key of funnel) checks[key] = Boolean(pr[key]?.checkbox);

  const platformProp = pr[P.platform];
  const platform =
    P.platformType === 'multi_select'
      ? (platformProp?.multi_select || []).map((o: any) => o.name).join(', ')
      : platformProp?.select?.name || '';

  return {
    id: page.id,
    type,
    naam: titleText(pr[P.title]),
    website: pr[P.website]?.url || '',
    outreach: pr[P.outreach]?.url || '',
    niche: pr[P.niche]?.select?.name || '',
    platform,
    score: pr[P.score]?.number ?? null,
    status: (pr[P.status]?.select?.name as StatusValue) || null,
    date: pr[P.date]?.date?.start || null,
    checks,
    f: {
      f1: Boolean(pr[P.f1]?.checkbox),
      f2: Boolean(pr[P.f2]?.checkbox),
      f3: Boolean(pr[P.f3]?.checkbox),
    },
    column: columnFromChecks(type, checks),
    notionUrl: page.url,
    lastEdited: page.last_edited_time,
  };
}

/** Haalt alle leads uit een database op (gepagineerd). Bron van waarheid. */
export async function listLeads(type: DbType): Promise<Lead[]> {
  const out: Lead[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({
      database_id: dbIdFor(type),
      page_size: 100,
      start_cursor: cursor,
    });
    for (const page of res.results) out.push(pageToLead(type, page));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** Telt hoeveel pagina's er in Notion staan (voor de drift-controle). */
export async function countLeads(type: DbType): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const res: any = await notion().databases.query({
      database_id: dbIdFor(type),
      page_size: 100,
      start_cursor: cursor,
    });
    n += res.results.length;
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return n;
}

export async function getLead(type: DbType, pageId: string): Promise<Lead> {
  const page: any = await notion().pages.retrieve({ page_id: pageId });
  return pageToLead(type, page);
}

/** Canonieke patch die de app naar een leadpagina schrijft. */
export type LeadPatch = {
  status?: StatusValue;
  date?: string | null; // null = Date leegmaken
  checks?: Record<string, boolean>;
  f?: Partial<{ f1: boolean; f2: boolean; f3: boolean }>;
  score?: number;
  niche?: string;
};

/** Vertaalt een canonieke patch naar echte Notion-properties en schrijft hem weg. */
export async function updateLead(type: DbType, pageId: string, patch: LeadPatch): Promise<void> {
  const P = propsFor(type);
  const funnel = funnelFor(type);
  const props: Record<string, any> = {};

  if (patch.status !== undefined) props[P.status] = { select: { name: patch.status } };
  if (patch.date !== undefined) props[P.date] = { date: patch.date ? { start: patch.date } : null };
  if (patch.score !== undefined) props[P.score] = { number: patch.score };
  if (patch.niche !== undefined) props[P.niche] = { select: { name: patch.niche } };

  if (patch.checks) {
    for (const [key, val] of Object.entries(patch.checks)) {
      // Sla checkboxes over die niet bestaan in deze database (bv. Gesprek bij partners).
      if (!funnel.includes(key as any)) continue;
      props[key] = { checkbox: val };
    }
  }
  if (patch.f) {
    if (patch.f.f1 !== undefined) props[P.f1] = { checkbox: patch.f.f1 };
    if (patch.f.f2 !== undefined) props[P.f2] = { checkbox: patch.f.f2 };
    if (patch.f.f3 !== undefined) props[P.f3] = { checkbox: patch.f.f3 };
  }

  if (Object.keys(props).length === 0) return;
  await notion().pages.update({ page_id: pageId, properties: props });
}
