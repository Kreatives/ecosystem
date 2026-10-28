import { NextResponse } from 'next/server';
import { moveToColumn, toggleCheckbox, runFollowup } from '@/lib/actions';
import { getLead } from '@/lib/notion';
import type { DbType } from '@/lib/env';
import type { FollowupAction } from '@/lib/followup';

/**
 * POST /api/leads/:id  — één schrijf-actie op een lead.
 * body: { type, action: 'move'|'checkbox'|'followup', ... }
 *   move:     { column }
 *   checkbox: { key, value }
 *   followup: { step }
 * Geeft de bijgewerkte lead terug zodat de UI direct klopt.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const type = (body.type === 'partner' ? 'partner' : 'client') as DbType;

  try {
    let extra: any = {};
    switch (body.action) {
      case 'move':
        extra = await moveToColumn(type, id, String(body.column));
        break;
      case 'checkbox':
        extra = await toggleCheckbox(type, id, String(body.key), Boolean(body.value));
        break;
      case 'followup':
        extra = await runFollowup(type, id, body.step as FollowupAction);
        break;
      default:
        return NextResponse.json({ error: `onbekende actie "${body.action}"` }, { status: 400 });
    }
    const lead = await getLead(type, id);
    return NextResponse.json({ ok: true, lead, ...extra });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
