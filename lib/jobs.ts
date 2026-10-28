/**
 * Simpel in-process job-register met een event-stroom per job. De run draait in de
 * achtergrond (niet-geawait) en pusht voortgang; de SSE-route abonneert zich erop.
 * Werkt lokaal en in één Node-instance. (Voor Vercel-schaal later een worker/queue.)
 * Best-effort spiegelen we naar de Supabase-tabellen jobs/job_logs.
 */
import { supabase } from './supabase';

export type JobEvent =
  | { kind: 'step'; key: StepKey; state: 'active' | 'done'; counter?: string }
  | { kind: 'leaderror'; key: StepKey; naam: string; reden: string }
  | { kind: 'log'; msg: string }
  | { kind: 'done'; summary: RunSummary }
  | { kind: 'error'; msg: string };

export type StepKey = 'scrape' | 'qualify' | 'analyse' | 'write';

export type RunSummary = {
  gevonden: number;
  gekwalificeerd: number;
  weggegooid: number;
  naarNotion: number;
  seconden: number;
};

export type Job = {
  id: string;
  events: JobEvent[];
  subs: Set<(e: JobEvent) => void>;
  done: boolean;
  startedAt: number;
};

const jobs = new Map<string, Job>();

function rid(): string {
  return `job_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

export function createJob(kind = 'scrape', meta: any = {}): Job {
  const job: Job = { id: rid(), events: [], subs: new Set(), done: false, startedAt: Date.now() };
  jobs.set(job.id, job);
  const sb = supabase();
  if (sb) sb.from('jobs').insert({ id: job.id, kind, status: 'running', progress: meta }).then(() => {}, () => {});
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function emit(job: Job, e: JobEvent): void {
  job.events.push(e);
  if (e.kind === 'done' || e.kind === 'error') job.done = true;
  for (const fn of job.subs) {
    try {
      fn(e);
    } catch {
      /* subscriber weg */
    }
  }
  const sb = supabase();
  if (sb) {
    if (e.kind === 'log' || e.kind === 'leaderror') {
      const msg = e.kind === 'log' ? e.msg : `${e.naam}: ${e.reden}`;
      sb.from('job_logs').insert({ job_id: job.id, level: e.kind === 'leaderror' ? 'warn' : 'info', msg }).then(() => {}, () => {});
    }
    if (e.kind === 'done') {
      sb.from('jobs').update({ status: 'done', result: e.summary, updated_at: new Date().toISOString() }).eq('id', job.id).then(() => {}, () => {});
    }
    if (e.kind === 'error') {
      sb.from('jobs').update({ status: 'error', error: e.msg, updated_at: new Date().toISOString() }).eq('id', job.id).then(() => {}, () => {});
    }
  }
}

export function subscribe(job: Job, fn: (e: JobEvent) => void): () => void {
  job.subs.add(fn);
  return () => job.subs.delete(fn);
}

/** Ruim oude afgeronde jobs op zodat de Map niet eindeloos groeit. */
export function sweep(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) if (job.done && job.startedAt < cutoff) jobs.delete(id);
}
