import { NextResponse, after } from 'next/server';
import { sweep } from '@/lib/jobs';
import { startRun, resolveBaseUrl, type RunInput } from '@/lib/chunk';
import type { DbType } from '@/lib/env';

// De run is opgeknipt in korte "ticks" die elkaar doorketenen (lib/chunk.ts),
// zodat hij de 300s serverless-limiet overleeft. De voortgang staat in Supabase.
export const maxDuration = 300;

/** POST /api/run — start een run. Geeft meteen een jobId terug; volg de voortgang
 *  via GET /api/run/:id/status (pollt Supabase, overleeft navigeren). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const brief = (body.brief || '').trim();
  if (!brief) return NextResponse.json({ error: 'omschrijf wie je zoekt' }, { status: 400 });

  const input: RunInput = {
    brief,
    aantal: Math.max(1, Math.min(50, Number(body.aantal) || 10)),
    type: (body.type === 'partner' ? 'partner' : 'client') as DbType,
    platform: ['linkedin', 'instagram', 'beide'].includes(body.platform) ? body.platform : 'beide',
    dryRun: Boolean(body.dryRun),
  };

  sweep();
  const base = resolveBaseUrl(req);

  // Brief lezen + Apify starten + job aanmaken gebeurt in after() (kost een paar
  // seconden); de response met jobId komt meteen terug.
  const jobId = `job_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
  after(async () => {
    try {
      await startRun({ ...input }, base, jobId);
    } catch {
      /* startRun logt zelf; de pipeline vangt fouten af */
    }
  });

  return NextResponse.json({ jobId });
}
