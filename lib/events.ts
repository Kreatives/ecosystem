import { supabase } from './supabase';
import type { DbType } from './env';
import type { Lead } from './types';
import { funnelFor } from './notion-schema';

export type EventName =
  | 'Sent' | 'Opened' | 'Replied' | 'Gesprek' | 'Booked' | 'Closed'
  | 'F1' | 'F2' | 'F3' | 'status';

/** Logt één gebeurtenis in het event-log. Stil als Supabase nog niet staat. */
export async function logEvent(
  pageId: string,
  type: DbType,
  event: EventName,
  opts: { value?: string; source?: 'app' | 'notion-sync' } = {},
): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.from('events').insert({
    page_id: pageId,
    type,
    event,
    value: opts.value ?? null,
    source: opts.source ?? 'app',
  });
}

export type EventRow = {
  page_id: string;
  type: DbType;
  event: string;
  value: string | null;
  source: 'app' | 'notion-sync';
};

/** Eén spiegelrij voor lead_mirror. */
export function mirrorRow(lead: Lead) {
  return {
    page_id: lead.id,
    type: lead.type,
    naam: lead.naam,
    column: lead.column,
    status: lead.status,
    date: lead.date,
    checks: lead.checks,
    f: lead.f,
    score: lead.score,
    last_edited: lead.lastEdited,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Berekent (puur, zonder I/O) welke events er zijn t.o.v. de vorige spiegel:
 * elke checkbox/F die false→true ging en elke status-wijziging. Op de eerste sync
 * van een lead (geen prev) geen events: die historie ligt vóór de app.
 */
export function diffLeadEvents(lead: Lead, prev: any | null): EventRow[] {
  if (!prev) return [];
  const rows: EventRow[] = [];
  const prevChecks = prev.checks || {};
  const prevF = prev.f || {};
  for (const key of funnelFor(lead.type)) {
    if (lead.checks[key] && !prevChecks[key]) {
      rows.push({ page_id: lead.id, type: lead.type, event: key, value: null, source: 'notion-sync' });
    }
  }
  for (const fk of ['f1', 'f2', 'f3'] as const) {
    if ((lead.f as any)[fk] && !prevF[fk]) {
      rows.push({ page_id: lead.id, type: lead.type, event: fk.toUpperCase(), value: null, source: 'notion-sync' });
    }
  }
  if (lead.status && lead.status !== prev.status) {
    rows.push({ page_id: lead.id, type: lead.type, event: 'status', value: lead.status, source: 'notion-sync' });
  }
  return rows;
}
