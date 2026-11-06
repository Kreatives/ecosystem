import { NextResponse, after } from 'next/server';
import { tick } from '@/lib/chunk';

// Eén brok werk van een lopende run. Wordt doorgeketend door chunk.ts zelf en
// door de status-poll (self-heal). Blijft ruim onder de 300s per invocatie.
export const maxDuration = 300;

function baseUrl(req: Request): string {
  const env = process.env.RUN_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return env || new URL(req.url).origin;
}

export async function POST(req: Request) {
  const secret = process.env.RUN_TICK_SECRET || '';
  if (secret && req.headers.get('x-run-key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const jobId = (body.jobId || '').trim();
  if (!jobId) return NextResponse.json({ error: 'jobId ontbreekt' }, { status: 400 });

  const base = baseUrl(req);
  // Het zware werk in after(): de response komt meteen terug zodat de keten snel
  // de volgende invocatie kan aftrappen.
  after(async () => {
    try {
      await tick(jobId, base);
    } catch {
      /* tick vangt zijn eigen fouten af en schrijft ze naar de job */
    }
  });

  return NextResponse.json({ ok: true });
}
