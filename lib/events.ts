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

/**
 * Vergelijkt de nieuwe lead-staat met de vorige spiegel en logt de overgangen
 * (checkbox false→true, status-wijziging). Werkt de spiegel bij. Op de eerste
 * sync van een lead wordt alleen geseed, zonder events: die historie ligt vóór
 * de app en krijgt geen verzonnen datum.
 */
export async function reconcileLead(lead: Lead, prev: any | null): Promise<void> {
  const sb = supabase();
  if (!sb) return;

  const funnel = funnelFor(lead.type);
  const mirrorRow = {
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

  if (prev) {
    const prevChecks = prev.checks || {};
    const prevF = prev.f || {};
    for (const key of funnel) {
      if (lead.checks[key] && !prevChecks[key]) {
        await logEvent(lead.id, lead.type, key as EventName, { source: 'notion-sync' });
      }
    }
    for (const fk of ['f1', 'f2', 'f3'] as const) {
      if ((lead.f as any)[fk] && !prevF[fk]) {
        await logEvent(lead.id, lead.type, fk.toUpperCase() as EventName, { source: 'notion-sync' });
      }
    }
    if (lead.status && lead.status !== prev.status) {
      await logEvent(lead.id, lead.type, 'status', { value: lead.status, source: 'notion-sync' });
    }
  }

  await sb.from('lead_mirror').upsert(mirrorRow, { onConflict: 'page_id' });
}
