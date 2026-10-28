# KREATIVES Outreach Ecosystem

Webapp die koude outreach half-automatiseert: leads scrapen, kwalificeren, website
analyseren, de volledige outreach-sequence klaarschrijven en alles tracken. **De app
verstuurt nooit iets** — Ricky verstuurt elk bericht zelf. Notion is de bron van waarheid.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase/Postgres voor het
event-log en jobs, Anthropic (Claude), Apify + Deep API voor scrapen/research,
Playwright voor screenshots. Draait lokaal en op Vercel.

## Status per fase

- **Fase 1 — klaar.** Notion-koppeling (beide databases), eigen DB-schema + event-log,
  tweerichtings-Kanban, follow-up-engine (Date/Status/F1–F3), tellingen die kloppen.
- Fase 2 (website-analist), 3 (outreach writer), 4 (qualifier), 5 (scraper-pipeline),
  6 (dagoverzicht + statistieken), 7 (deploy) volgen.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul de sleutels in (zie hieronder)
npm run dev                  # http://localhost:3000
```

`.env.local` is lokaal al gevuld met de Notion/Apify/Anthropic-sleutels uit de bestaande
lead-scraper. Vul `DEEPAPI_API_KEY` en de Supabase-sleutels aan wanneer je die hebt.

### Sleutels

| Variabele | Nodig voor | Status |
|---|---|---|
| `NOTION_TOKEN` | alles | ✅ ingevuld |
| `NOTION_CLIENTS_DATABASE_ID` | Clients-DB | ✅ |
| `NOTION_PARTNER_DATABASE_ID` | Partners-DB | ✅ |
| `ANTHROPIC_API_KEY` | qualifier, analyse, writer | ✅ |
| `APIFY_TOKEN` | scrapen (LinkedIn/Maps/IG) | ✅ |
| `DEEPAPI_API_KEY` | website-analyse, concurrenten, verrijking | ⛔ nog invullen |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | event-log, statistieken | ⛔ nog invullen |

De Kanban en de sync werken **zonder** Supabase. Zonder Supabase wordt alleen het
event-log (verstuurdatums voor de statistieken) nog niet bijgehouden.

## Supabase instellen (stappenplan)

1. Maak een project op [supabase.com](https://supabase.com) → **New project**. Kies een
   regio in de EU (Frankfurt). Bewaar het database-wachtwoord.
2. Open in het project **SQL Editor** → **New query**, plak de inhoud van
   [`supabase/schema.sql`](supabase/schema.sql) en klik **Run**. Dit maakt de tabellen
   `lead_mirror`, `events`, `sync_runs`, `jobs`, `job_logs`, `analyses`, `scrape_runs`.
3. Ga naar **Project Settings → API**. Kopieer:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret (onder Project API keys) → `SUPABASE_SERVICE_ROLE_KEY`
     (alleen server-side, nooit naar de browser).
4. Zet beide in `.env.local` (lokaal) en later in de Vercel-projectinstellingen.
5. Herstart `npm run dev`. Vanaf nu vult elke actie en elke sync het event-log.

## Wat Ricky in Notion doet

- Leads en hun checkboxes/status leven in Notion. De app leest ze live en schrijft terug.
- Vink je zelf een checkbox aan in Notion, dan verandert de kolom in de app bij de volgende
  sync. Sleep je in de app, dan vinkt hij de checkboxes in Notion aan.
- Pas je `Date` zelf aan in Notion, dan blijft jouw datum staan; de app overschrijft hem niet.
- **Geen nieuwe properties aanmaken.** De app gebruikt exact de bestaande kolommen.

## Scripts

- `scripts/migrate-partners-db.ts` — eenmalige migratie (al uitgevoerd): voegt `Date` toe
  aan de Partners-DB en trekt de `Status`-opties gelijk met Clients.

## Belangrijk over de twee databases

De live property-namen wijken licht af van de bouwopdracht en worden **exact** zo gebruikt:

- Clients: Score = `Score (0-10)`, Outreach = `Outreach link`, Platform = single-select,
  heeft `Gesprek` + `EXTRA`.
- Partners: Score = `Score`, Outreach = `Outreach link`, Platform = multi-select, **geen**
  `Gesprek`, **geen** `EXTRA`. `Date` en de sequence-`Status` zijn via de migratie toegevoegd.
  Partner-funnel: Sent → Opened → Replied → Booked → Closed.
