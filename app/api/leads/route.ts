import { NextResponse, after } from 'next/server';
import { fetchLeads, reconcileMirror } from '@/lib/sync';
import type { DbType } from '@/lib/env';

/**
 * GET /api/leads?type=client|partner → leads + tellingen.
 * Antwoordt zodra Notion (bron van waarheid) is opgehaald; de spiegel en het
 * event-log worden ná de response bijgewerkt met after(), zodat de UI niet wacht.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') === 'partner' ? 'partner' : 'client') as DbType;
  try {
    const { leads, counts } = await fetchLeads(type);
    after(async () => {
      try {
        await reconcileMirror(type, leads);
      } catch {
        // event-log is niet kritiek voor de weergave; fouten mogen de app niet raken
      }
    });
    return NextResponse.json({ leads, counts });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
