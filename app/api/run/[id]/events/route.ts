import { getJob, subscribe, type JobEvent } from '@/lib/jobs';

/** GET /api/run/:id/events — Server-Sent Events met de live voortgang van een run. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return new Response('job niet gevonden', { status: 404 });

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

      // eerst de al verzamelde events terugspelen
      for (const e of job.events) send(e);
      if (job.done) {
        controller.close();
        return;
      }

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
