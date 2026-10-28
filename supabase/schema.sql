-- KREATIVES Outreach Ecosystem — eigen database (Supabase/Postgres)
-- Bevat ALLEEN: spiegel van de Notion-sleutels, event-log (verstuurdatums),
-- scrape/analyse-output, screenshot-URL's en jobs/logs. Geen leaddata-bron:
-- Notion blijft leidend. Veilig om opnieuw te draaien (idempotent).

-- 1) Lichte spiegel per lead: genoeg om drift te detecteren en te zien WANNEER
--    een checkbox/status veranderde. Leadtekst leeft in Notion.
create table if not exists lead_mirror (
  page_id      text primary key,
  type         text not null check (type in ('client','partner')),
  naam         text,
  "column"     text,
  status       text,
  date         date,
  checks       jsonb not null default '{}'::jsonb,
  f            jsonb not null default '{}'::jsonb,
  score        numeric,
  last_edited  timestamptz,
  synced_at    timestamptz not null default now()
);
create index if not exists lead_mirror_type_idx on lead_mirror (type);

-- 2) Event-log: elke keer dat een funnel-checkbox of een F-checkbox aan ging, of
--    de Status wijzigde. Dit zijn de verstuurdatums voor de statistieken.
create table if not exists events (
  id          bigint generated always as identity primary key,
  page_id     text not null,
  type        text not null check (type in ('client','partner')),
  event       text not null,              -- 'Sent' | 'Opened' | 'Replied' | 'Gesprek' | 'Booked' | 'Closed' | 'F1'..'F3' | 'status'
  value       text,                       -- bij 'status': de nieuwe waarde
  occurred_at timestamptz not null default now(),
  source      text not null default 'app' -- 'app' (actie in de app) of 'notion-sync' (afgeleid bij sync)
);
create index if not exists events_page_idx on events (page_id);
create index if not exists events_event_idx on events (type, event, occurred_at);

-- 3) Sync-runs: telling beide kanten + afwijking, voor de "tellingen kloppen"-eis.
create table if not exists sync_runs (
  id            bigint generated always as identity primary key,
  type          text not null,
  notion_count  int not null,
  mirror_count  int not null,
  drift         int not null,
  note          text,
  ran_at        timestamptz not null default now()
);

-- 4) Jobs + logs: voor de achtergrond-pipelines (scrapen/analyseren/schrijven).
create table if not exists jobs (
  id          text primary key,
  kind        text not null,              -- 'scrape' | 'analyse' | 'write' | 'sync'
  status      text not null default 'running', -- 'running' | 'done' | 'error'
  progress    jsonb not null default '{}'::jsonb,
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists job_logs (
  id      bigint generated always as identity primary key,
  job_id  text not null references jobs(id) on delete cascade,
  level   text not null default 'info',
  msg     text not null,
  at      timestamptz not null default now()
);
create index if not exists job_logs_job_idx on job_logs (job_id, at);

-- 5) Analyse-output per lead (website-analist, fase 2). Screenshot-URL's erbij.
create table if not exists analyses (
  page_id        text primary key,
  pijnpunten     jsonb,
  compliment     text,
  concurrenten   jsonb,
  loom_bullets   jsonb,
  screenshot_desktop text,
  screenshot_mobiel  text,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 6) Scrape-resultaten per run (ruwe + genormaliseerde leads, voor de run-log).
create table if not exists scrape_runs (
  id          text primary key,
  prompt      text,
  type        text,
  platform    text,
  gevonden    int default 0,
  gekwalificeerd int default 0,
  weggegooid  int default 0,
  naar_notion int default 0,
  created_at  timestamptz not null default now()
);
