import { NextResponse } from 'next/server';
import { createJob, sweep } from '@/lib/jobs';
import { runPipeline, type RunInput } from '@/lib/run-pipeline';
import type { DbType } from '@/lib/env';

/** POST /api/run — start een run. Geeft meteen een jobId terug; de voortgang
 *  volg je via GET /api/run/:id/events (SSE). */
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
  const job = createJob('scrape', { brief: input.brief, type: input.type, platform: input.platform });
  // Niet awaiten: draait op de achtergrond, voortgang via SSE.
  void runPipeline(job, input);

  return NextResponse.json({ jobId: job.id });
}
