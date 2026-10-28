import type { DbType } from './env';
import { listLeads, countLeads } from './notion';
import { supabase } from './supabase';
import { diffLeadEvents, mirrorRow, type EventRow } from './events';
import type { Lead, Counts } from './types';

export type SyncResult = {
  type: DbType;
  leads: Lead[];
  counts: Counts;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Haalt alle leads uit Notion (bron van waarheid). Snel: alleen de Notion-fetch.
 * De spiegel/event-log worden hierna los weggeschreven (zie reconcileMirror),
 * zodat de UI niet op de database-writes wacht.
 */
export async function fetchLeads(type: DbType): Promise<SyncResult> {
  const leads = await listLeads(type);
  // De app toont ALTIJD het aantal uit Notion.
  return { type, leads, counts: { notion: leads.length, shown: leads.length, drift: 0 } };
}

/**
 * Spiegelt de leads naar de eigen database met event-detectie (gebatcht), en logt
 * de afwijking. Draait ná de response via `after()`, dus blokkeert de UI niet.
 * Werkt stil als Supabase nog niet staat.
 */
export async function reconcileMirror(type: DbType, leads: Lead[]): Promise<void> {
  const sb = supabase();
  if (!sb) return;

  const notionCount = leads.length;
  const { data: prevRows } = await sb.from('lead_mirror').select('*').eq('type', type);
  const prevById = new Map((prevRows || []).map((r: any) => [r.page_id, r]));

  const events: EventRow[] = [];
  for (const lead of leads) events.push(...diffLeadEvents(lead, prevById.get(lead.id) ?? null));
  if (events.length) {
    for (const part of chunk(events, 500)) await sb.from('events').insert(part);
  }

  const rows = leads.map(mirrorRow);
  for (const part of chunk(rows, 500)) {
    await sb.from('lead_mirror').upsert(part, { onConflict: 'page_id' });
  }

  const liveIds = new Set(leads.map((l) => l.id));
  const stale = (prevRows || []).filter((r: any) => !liveIds.has(r.page_id)).map((r: any) => r.page_id);
  if (stale.length) await sb.from('lead_mirror').delete().in('page_id', stale);

  const prevCount = (prevRows || []).length;
  const drift = notionCount - prevCount;
  await sb.from('sync_runs').insert({
    type,
    notion_count: notionCount,
    mirror_count: notionCount,
    drift,
    note: drift === 0 ? 'in sync' : `afwijking ${drift}, gecorrigeerd vanuit Notion`,
  });
}

/** Volledige sync inclusief spiegel (voor cron/handmatig, waar blokkeren oké is). */
export async function syncType(type: DbType): Promise<SyncResult> {
  const res = await fetchLeads(type);
  await reconcileMirror(type, res.leads);
  return res;
}

/** Alleen tellen, zonder de volledige lijst mee te sturen. */
export async function countOnly(type: DbType): Promise<number> {
  return countLeads(type);
}
