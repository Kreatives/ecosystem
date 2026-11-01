import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getJob } from '@/lib/jobs';

/** GET /api/run/:id/status — huidige stand van een run, uit Supabase (overleeft
 *  navigeren) met het geheugen als snelle fallback. Plus de laatste logregels. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabase();

  if (sb) {
    const { data: job } = await sb.from('jobs').select('status,progress,result,error').eq('id', id).maybeSingle();
    if (job) {
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
