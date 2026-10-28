/**
 * Alle schrijf-acties vanuit de app lopen hier langs. Elke actie:
 *  1. berekent een canonieke patch,
 *  2. schrijft die naar Notion (bron van waarheid),
 *  3. logt de relevante gebeurtenissen in het event-log (verstuurdatums).
 * Niets hiervan verstuurt ooit een bericht.
 */
import type { DbType } from './env';
import { getLead, updateLead, type LeadPatch } from './notion';
import { checksForColumn } from './kanban';
import { funnelFor } from './notion-schema';
import { applyFollowup, type FollowupAction } from './followup';
import { logEvent, type EventName } from './events';
import type { Lead } from './types';

const AFGEROND_TRIGGERS = new Set(['Gesprek', 'Booked', 'Closed']);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Logt elke checkbox/F die in deze patch naar true gaat, plus een status-wijziging. */
async function logPatch(lead: Lead, patch: LeadPatch, status?: string) {
  if (patch.checks) {
    for (const [key, val] of Object.entries(patch.checks)) {
      if (val && !lead.checks[key]) await logEvent(lead.id, lead.type, key as EventName, { source: 'app' });
    }
  }
  if (patch.f) {
    for (const fk of ['f1', 'f2', 'f3'] as const) {
      if (patch.f[fk] && !lead.f[fk]) await logEvent(lead.id, lead.type, fk.toUpperCase() as EventName, { source: 'app' });
    }
  }
  if (status) await logEvent(lead.id, lead.type, 'status', { value: status, source: 'app' });
}

/** Kanban: sleep een lead naar een kolom. Zet de checkboxes tot en met die kolom. */
export async function moveToColumn(type: DbType, pageId: string, column: string) {
  const lead = await getLead(type, pageId);
  const checks = checksForColumn(type, column) as Record<string, boolean>;
  const patch: LeadPatch = { checks };

  // Regel: Gesprek/Booked/Closed aangevinkt → afgerond, datum leeg.
  if (AFGEROND_TRIGGERS.has(column)) {
    patch.status = 'Afgerond';
    patch.date = null;
  }

  await updateLead(type, pageId, patch);
  await logPatch(lead, patch, patch.status);
  return { ok: true, column };
}

/** Eén checkbox direct aan/uit zetten (vanuit de lead-detail of kaart). */
export async function toggleCheckbox(type: DbType, pageId: string, key: string, value: boolean) {
  const lead = await getLead(type, pageId);
  if (!funnelFor(type).includes(key as any)) {
    throw new Error(`Checkbox "${key}" bestaat niet in de ${type}-database.`);
  }
  const patch: LeadPatch = { checks: { [key]: value } };

  if (value && AFGEROND_TRIGGERS.has(key)) {
    patch.status = 'Afgerond';
    patch.date = null;
  }
  // Replied aangevinkt: volg de follow-up-regel (datum vandaag bij Status Day 2).
  if (value && key === 'Replied') {
    const f = applyFollowup(type, 'replied', { today: todayStr(), status: lead.status });
    if (f.date !== undefined) patch.date = f.date;
  }

  await updateLead(type, pageId, patch);
  await logPatch(lead, patch, patch.status);
  return { ok: true };
}

/** Een follow-up-stap markeren als verstuurd (knop in het dagoverzicht/detail). */
export async function runFollowup(type: DbType, pageId: string, action: FollowupAction) {
  const lead = await getLead(type, pageId);
  const f = applyFollowup(type, action, { today: todayStr(), status: lead.status });
  const patch: LeadPatch = { status: f.status, date: f.date, checks: f.checks, f: f.f };
  await updateLead(type, pageId, patch);
  await logPatch(lead, patch, f.status);
  return { ok: true, note: f.note, showMessage: f.showMessage };
}
