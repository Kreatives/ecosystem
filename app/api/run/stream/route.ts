import { createJob, subscribe, sweep, type JobEvent } from '@/lib/jobs';
import { runPipeline, type RunInput } from '@/lib/run-pipeline';
import type { DbType } from '@/lib/env';

// Serverless-proof: de hele run draait in dit ene request en streamt live mee,
// zodat er geen losse achtergrond-job nodig is (die zou op Vercel gekild worden).
export const maxDuration = 300;

/** GET /api/run/stream?brief=..&aantal=..&type=..&platform=..&dryRun=.. → SSE-run. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brief = (searchParams.get('brief') || '').trim();
  if (!brief) return new Response('data: {"kind":"error","msg":"omschrijf wie je zoekt"}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });

  const input: RunInput = {
    brief,
    aantal: Math.max(1, Math.min(50, Number(searchParams.get('aantal')) || 10)),
    type: (searchParams.get('type') === 'partner' ? 'partner' : 'client') as DbType,
    platform: ['linkedin', 'instagram', 'beide'].includes(searchParams.get('platform') || '')
      ? (searchParams.get('platform') as RunInput['platform'])
      : 'beide',
    dryRun: searchParams.get('dryRun') === '1',
  };

  sweep();
  const job = createJob('scrape', { brief: input.brief, type: input.type });
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: JobEvent) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* stream dicht */
        }
      };
      send({ kind: 'log', msg: 'Run gestart…' } as JobEvent);

      const unsub = subscribe(job, (e) => {
        send(e);
        if (e.kind === 'done' || e.kind === 'error') {
          unsub();
          try {
            controller.close();
          } catch {
            /* al dicht */
          }
        }
      });

      // in dezelfde invocatie draaien → functie blijft leven zolang het request open is
      runPipeline(job, input).catch((err) => send({ kind: 'error', msg: err?.message || String(err) } as JobEvent));

      req.signal.addEventListener('abort', () => {
        unsub();
        try {
          controller.close();
        } catch {
          /* al dicht */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
