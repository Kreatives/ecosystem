/**
 * Job-register met voortgang die naar Supabase wordt gespiegeld, zodat een run
 * doorloopt en te volgen is ook als je de pagina verlaat. De UI pollt de status
 * uit Supabase (lib: /api/run/[id]/status), niet uit het geheugen van één request.
 */
import { supabase } from './supabase';

export type StepKey = 'scrape' | 'qualify' | 'analyse' | 'write';

export type JobEvent =
  | { kind: 'step'; key: StepKey; state: 'active' | 'done'; counter?: string }
  | { kind: 'leaderror'; key: StepKey; naam: string; reden: string }
  | { kind: 'log'; msg: string }
  | { kind: 'done'; summary: RunSummary }
  | { kind: 'error'; msg: string };

export type RunSummary = {
  gevonden: number;
  gekwalificeerd: number;
  weggegooid: number;
  naarNotion: number;
  seconden: number;
};

export type StepInfo = { state: 'upcoming' | 'active' | 'done'; counter?: string; errors: { naam: string; reden: string }[] };

export type Job = {
  id: string;
  meta: any;
  events: JobEvent[];
  subs: Set<(e: JobEvent) => void>;
  steps: Record<StepKey, StepInfo>;
  summary: RunSummary | null;
  status: 'running' | 'done' | 'error';
  error?: string;
  done: boolean;
  startedAt: number;
  lastFlush: number;
};

const STEP_KEYS: StepKey[] = ['scrape', 'qualify', 'analyse', 'write'];
const jobs = new Map<string, Job>();

function rid(): string {
  return `job_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

function initSteps(): Record<StepKey, StepInfo> {
  const s = {} as Record<StepKey, StepInfo>;
  for (const k of STEP_KEYS) s[k] = { state: 'upcoming', errors: [] };
  return s;
}

export function createJob(kind = 'scrape', meta: any = {}): Job {
  const job: Job = {
    id: rid(), meta, events: [], subs: new Set(), steps: initSteps(),
    summary: null, status: 'running', done: false, startedAt: Date.now(), lastFlush: 0,
  };
  jobs.set(job.id, job);
  const sb = supabase();
  if (sb) sb.from('jobs').insert({ id: job.id, kind, status: 'running', progress: snapshot(job) }).then(() => {}, () => {});
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

function snapshot(job: Job) {
  return { ...job.meta, steps: job.steps, summary: job.summary, startedAt: job.startedAt };
}

/** Schrijft de huidige voortgang naar Supabase (gethrottled, tenzij force). */
function flush(job: Job, force = false) {
  const sb = supabase();
  if (!sb) return;
  const now = Date.now();
  if (!force && now - job.lastFlush < 1500) return;
  job.lastFlush = now;
  sb.from('jobs').update({ status: job.status, progress: snapshot(job), result: job.summary, error: job.error, updated_at: new Date().toISOString() })
    .eq('id', job.id).then(() => {}, () => {});
}

export function emit(job: Job, e: JobEvent): void {
  job.events.push(e);
  // in-memory status bijwerken
  if (e.kind === 'step') job.steps[e.key] = { ...job.steps[e.key], state: e.state, counter: e.counter };
  if (e.kind === 'leaderror') job.steps[e.key].errors.push({ naam: e.naam, reden: e.reden });
  if (e.kind === 'done') { job.summary = e.summary; job.status = 'done'; job.done = true; }
  if (e.kind === 'error') { job.error = e.msg; job.status = 'error'; job.done = true; }

  for (const fn of job.subs) { try { fn(e); } catch { /* weg */ } }

  const sb = supabase();
  if (sb && (e.kind === 'log' || e.kind === 'leaderror')) {
    const msg = e.kind === 'log' ? e.msg : `${e.naam}: ${e.reden}`;
    sb.from('job_logs').insert({ job_id: job.id, level: e.kind === 'leaderror' ? 'warn' : 'info', msg }).then(() => {}, () => {});
  }
  flush(job, e.kind === 'done' || e.kind === 'error');
}

export function subscribe(job: Job, fn: (e: JobEvent) => void): () => void {
  job.subs.add(fn);
  return () => job.subs.delete(fn);
}

export function sweep(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.done && job.startedAt < cutoff) jobs.delete(id);
}
