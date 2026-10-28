import type { DbType } from './env';
import { listLeads, countLeads } from './notion';
import { supabase } from './supabase';
import { reconcileLead } from './events';
import type { Lead, Counts } from './types';

export type SyncResult = {
  type: DbType;
  leads: Lead[];
  counts: Counts;
};

/**
 * De sync: haalt alle leads uit Notion (bron van waarheid), spiegelt ze naar de
 * eigen database met event-detectie, telt beide kanten en logt de afwijking.
 * De app toont ALTIJD het aantal dat uit Notion komt; de spiegel wordt
 * daarnaartoe gecorrigeerd. Werkt ook zonder Supabase (dan alleen Notion).
 */
export async function syncType(type: DbType): Promise<SyncResult> {
  const leads = await listLeads(type);
  const notionCount = leads.length;

  const sb = supabase();
  let mirrorCount = notionCount;

  if (sb) {
    // Vorige spiegel ophalen voor event-detectie.
    const { data: prevRows } = await sb.from('lead_mirror').select('*').eq('type', type);
    const prevById = new Map((prevRows || []).map((r: any) => [r.page_id, r]));

    for (const lead of leads) {
      try {
        await reconcileLead(lead, prevById.get(lead.id) ?? null);
      } catch {
        // Fouten in één lead mogen de sync nooit stoppen.
      }
    }

    // Verwijder spiegelrijen van leads die niet meer in Notion staan (corrigeer vanuit Notion).
    const liveIds = new Set(leads.map((l) => l.id));
    const stale = (prevRows || []).filter((r: any) => !liveIds.has(r.page_id)).map((r: any) => r.page_id);
    if (stale.length) await sb.from('lead_mirror').delete().in('page_id', stale);

    const { count } = await sb
      .from('lead_mirror')
      .select('page_id', { count: 'exact', head: true })
      .eq('type', type);
    mirrorCount = count ?? notionCount;

    const drift = notionCount - mirrorCount;
    await sb.from('sync_runs').insert({
      type,
      notion_count: notionCount,
      mirror_count: mirrorCount,
      drift,
      note: drift === 0 ? 'in sync' : `afwijking ${drift}, gecorrigeerd vanuit Notion`,
    });
  }

  return {
    type,
    leads,
    counts: { notion: notionCount, shown: notionCount, drift: notionCount - mirrorCount },
  };
}

/** Alleen tellen, zonder de volledige lijst mee te sturen. */
export async function countOnly(type: DbType): Promise<number> {
  return countLeads(type);
}
