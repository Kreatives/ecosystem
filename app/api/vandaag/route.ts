import { NextResponse } from 'next/server';
import { fetchLeads } from '@/lib/sync';
import { getBericht } from '@/lib/notion';
import { nextStep } from '@/lib/next-step';
import type { DbType } from '@/lib/env';
import type { Lead } from '@/lib/types';

const today = () => new Date().toISOString().slice(0, 10);
function plusDays(d: string, n: number) {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const ACTIEF = new Set(['Day 1', 'Day 2', 'Day 3', 'Day 4']);
const MAX_FETCH = 40; // begrens het aantal Notion-bericht-ophalingen per load

/** GET /api/vandaag?type=client|partner — wat moet er vandaag verstuurd worden. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') === 'partner' ? 'partner' : 'client') as DbType;
  const t = today();
  const over7 = plusDays(t, 7);

  try {
    const { leads } = await fetchLeads(type);

    const vandaag: Lead[] = [];
    const straks: Lead[] = [];
    const nogTeStarten: Lead[] = [];
    for (const l of leads) {
      if (l.status === 'Nog niet gestart') {
        nogTeStarten.push(l);
      } else if (l.status && ACTIEF.has(l.status) && l.date) {
        if (l.date <= t) vandaag.push(l);
        else if (l.date <= over7) straks.push(l);
      }
    }
    vandaag.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    straks.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const verrijk = async (list: Lead[], metBericht: boolean) => {
      let fetched = 0;
      return Promise.all(
        list.map(async (l) => {
          const step = nextStep(type, l.status, l.checks, l.f);
          let bericht = '';
          if (metBericht && step?.berichtLabel && fetched < MAX_FETCH) {
            fetched++;
            bericht = await getBericht(l.id, step.berichtLabel);
          }
          return {
            id: l.id, naam: l.naam, status: l.status, date: l.date, niche: l.niche,
            platform: l.platform, outreach: l.outreach, website: l.website, notionUrl: l.notionUrl,
            step, bericht,
          };
        }),
      );
    };

    return NextResponse.json({
      vandaag: await verrijk(vandaag, true),
      nogTeStarten: await verrijk(nogTeStarten.slice(0, MAX_FETCH), true),
      nogTeStartenTotaal: nogTeStarten.length,
      straks: await verrijk(straks, false),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
