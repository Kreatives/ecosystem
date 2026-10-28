import { NextResponse } from 'next/server';
import { syncType } from '@/lib/sync';
import type { DbType } from '@/lib/env';

/** GET /api/leads?type=client|partner → leads + tellingen (sync met Notion). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') === 'partner' ? 'partner' : 'client') as DbType;
  try {
    const { leads, counts } = await syncType(type);
    return NextResponse.json({ leads, counts });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
