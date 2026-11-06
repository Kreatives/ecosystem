import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getJob } from '@/lib/jobs';
import { triggerTick } from '@/lib/chunk';

const STALE_MS = 90_000; // zonder update al 90s → keten vermoedelijk gebroken

function baseUrl(req: Request): string {
  const env = process.env.RUN_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return env || new URL(req.url).origin;
}

/** GET /api/run/:id/status — huidige stand van een run, uit Supabase (overleeft
 *  navigeren) met het geheugen als snelle fallback. Plus de laatste logregels.
 *  Heelt onderweg een afgebroken tick-keten: staat de run al 90s stil, dan
 *  trappen we hem opnieuw aan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabase();

  if (sb) {
    const { data: job } = await sb.from('jobs').select('status,progress,result,error,updated_at').eq('id', id).maybeSingle();
    if (job) {
      // Self-heal: lopende chunked run die blijft hangen → tick opnieuw aftrappen.
      const wf: any = (job.progress as any)?._wf;
      if (job.status === 'running' && wf?.phase && wf.phase !== 'done' && wf.phase !== 'error') {
        const age = Date.now() - new Date(job.updated_at as string).getTime();
        if (age > STALE_MS) {
          // Touch updated_at zodat volgende polls niet óók aftrappen (debounce).
          await sb.from('jobs').update({ updated_at: new Date().toISOString() }).eq('id', id).then(() => {}, () => {});
          const base = baseUrl(req);
          after(() => triggerTick(base, id));
        }
      }

      const { data: logs } = await sb
        .from('job_logs')
        .select('msg,at')
        .eq('job_id', id)
        .order('at', { ascending: false })
        .limit(12);
      const p: any = job.progress || {};
      return NextResponse.json({
        status: job.status,
        steps: p.steps || {},
        summary: job.result || p.summary || null,
        error: job.error || null,
        logs: (logs || []).reverse().map((l: any) => l.msg),
      });
    }
  }

  // fallback: in-memory (lokaal zonder Supabase)
  const mem = getJob(id);
  if (mem) return NextResponse.json({ status: mem.status, steps: mem.steps, summary: mem.summary, error: mem.error || null, logs: [] });
  return NextResponse.json({ error: 'run niet gevonden' }, { status: 404 });
}
