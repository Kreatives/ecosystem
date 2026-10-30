import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { DbType } from '@/lib/env';

const FUNNEL = ['Sent', 'Opened', 'Replied', 'Gesprek', 'Booked', 'Closed'] as const;

/** ISO-achtige week-sleutel (YYYY-Www) uit een ISO-datumstring. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** GET /api/stats?type=client|partner — funnel totaal + trend per week. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') === 'partner' ? 'partner' : 'client') as DbType;
  const sb = supabase();
  if (!sb) return NextResponse.json({ error: 'Supabase niet geconfigureerd' }, { status: 400 });

  const funnel = type === 'partner' ? FUNNEL.filter((f) => f !== 'Gesprek') : FUNNEL;

  try {
    // Totalen uit de huidige staat (spiegel van Notion).
    const { data: rows } = await sb.from('lead_mirror').select('checks').eq('type', type);
    const totaal: Record<string, number> = { gekwalificeerd: (rows || []).length };
    for (const f of funnel) totaal[f] = 0;
    for (const r of rows || []) for (const f of funnel) if ((r.checks || {})[f]) totaal[f]++;

    // Gescrapet/gekwalificeerd per run (app-runs).
    const { data: runs } = await sb.from('scrape_runs').select('gevonden,gekwalificeerd,created_at').eq('type', type);
    totaal.gescrapet = (runs || []).reduce((n, r) => n + (r.gevonden || 0), 0);

    // Trend per week uit het event-log (wanneer een funnel-checkbox aanging).
    const { data: events } = await sb
      .from('events')
      .select('event,occurred_at')
      .eq('type', type)
      .in('event', funnel as unknown as string[]);
    const weken: Record<string, Record<string, number>> = {};
    for (const e of events || []) {
      const w = weekKey(e.occurred_at);
      (weken[w] ||= {})[e.event] = ((weken[w] || {})[e.event] || 0) + 1;
    }
    for (const r of runs || []) {
      const w = weekKey(r.created_at);
      (weken[w] ||= {}).gescrapet = ((weken[w] || {}).gescrapet || 0) + (r.gevonden || 0);
      (weken[w] ||= {}).gekwalificeerd = ((weken[w] || {}).gekwalificeerd || 0) + (r.gekwalificeerd || 0);
    }
    const perWeek = Object.entries(weken)
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Percentages tussen de funnel-stappen.
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const conversies: Record<string, number> = {};
    for (let i = 1; i < funnel.length; i++) conversies[`${funnel[i - 1]}→${funnel[i]}`] = pct(totaal[funnel[i]], totaal[funnel[i - 1]]);
    conversies['Gekwalificeerd→Sent'] = pct(totaal.Sent || 0, totaal.gekwalificeerd);

    return NextResponse.json({ type, funnel, totaal, conversies, perWeek });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
