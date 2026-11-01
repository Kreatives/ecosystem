import { NextResponse, after } from 'next/server';
import { createJob, sweep } from '@/lib/jobs';
import { runPipeline, type RunInput } from '@/lib/run-pipeline';
import type { DbType } from '@/lib/env';

// De run draait in after(): die blijft leven ná de response, dus ook als je de
// pagina verlaat (tot de functie-tijdslimiet). De voortgang staat in Supabase.
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
  const job = createJob('scrape', { brief: input.brief, type: input.type, platform: input.platform });

  after(async () => {
    try {
      await runPipeline(job, input);
    } catch {
      /* de pipeline vangt zijn eigen fouten al af en logt ze */
    }
  });

  return NextResponse.json({ jobId: job.id });
}
