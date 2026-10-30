# KREATIVES Outreach Ecosystem

Webapp die koude outreach half-automatiseert: leads scrapen, kwalificeren, website
analyseren, de volledige outreach-sequence klaarschrijven en alles tracken. **De app
verstuurt nooit iets** — Ricky verstuurt elk bericht zelf. Notion is de bron van waarheid.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase/Postgres voor het
event-log/jobs/analyse, Anthropic (Claude, incl. ingebouwde web search voor
concurrenten), Apify voor scrapen, Playwright voor screenshots. Draait lokaal en op Vercel.

## Status per fase — alles klaar

- **1** Notion-koppeling (beide DB's), eigen DB + event-log, tweerichtings-Kanban, follow-up-engine.
- **2** Website-analist: compliment over het bedrijf, 5 pijnpunten, 3 NL + 3 buitenlandse
  concurrenten (Claude web search), Loom-bullets, screenshots (desktop + mobiel).
- **3** Outreach-writer: volledige sequence per `flow-klant.md` / `flow-partner.md`, nette opmaak.
- **4** Qualifier 40/30/30 (ICP) + partner-qualifier, met skip-regels.
- **5** Scraper (Apify, Google Maps voor bedrijven + Instagram voor personal brands),
  prompt-gestuurd, live run-scherm met voortgang.
- **6** Dagoverzicht ("Vandaag") met kopieerknop + acties, en statistieken (funnel + weektrend).
- **7** Vercel-klaar (deze README).

Deep API bleek niet nodig: concurrenten lopen via Claude's web search, screenshots via Playwright.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul de sleutels in (zie hieronder)
npm run dev                  # http://localhost:3000
```

### Sleutels (dezelfde lokaal én op Vercel)

| Variabele | Nodig voor |
|---|---|
| `NOTION_TOKEN` | alles |
| `NOTION_CLIENTS_DATABASE_ID` | Clients-DB |
| `NOTION_PARTNER_DATABASE_ID` | Partners-DB |
| `ANTHROPIC_API_KEY` | qualifier, analyse, writer, concurrenten (web search) |
| `APIFY_TOKEN` | scrapen (Google Maps / Instagram) |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` | event-log, statistieken, analyse-opslag, screenshots |
| `MIN_SCORE` | drempel (standaard 6) |

`DEEPAPI_API_KEY` is **niet** nodig. De Kanban en sync werken ook zonder Supabase; dan
worden alleen het event-log en de statistieken nog niet bijgehouden.

## Een run starten

1. Ga naar **Nieuwe run**.
2. Beschrijf wie je zoekt (bv. "organisatieadviesbureaus in Utrecht met 5–30 medewerkers"),
   kies aantal, type (Klant/Partner) en platform. Zet eventueel **Testrun** aan (schrijft niets).
3. **Start run** → je ziet live: scrapen → kwalificeren → analyseren → berichten schrijven.
   Gekwalificeerde leads (6+) komen in Notion met score, onderbouwing, concurrenten,
   Loom-bullets, screenshots en de volledige berichten-sequence.
4. Daarna werk je via **Kanban** (sleep tussen kolommen) en **Vandaag** (kopieer het bericht
   dat nu klaarstaat, klik "verstuurd" nadat je het zelf hebt gestuurd).

## Supabase instellen (stappenplan)

1. Maak een project op [supabase.com](https://supabase.com) → **New project** (regio EU/Frankfurt).
2. **SQL Editor** → **New query** → plak [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Dit maakt de tabellen én de rechten voor de secret key.
3. **Project Settings → API Keys** → kopieer de **secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY`,
   en **Project URL** → `SUPABASE_URL`.
4. **Storage** → maak een **public** bucket `screenshots` (of hij wordt automatisch gemaakt bij
   de eerste run als de rechten kloppen).
5. Zet beide waarden in `.env.local` en in de Vercel-projectinstellingen. Herstart `npm run dev`.

## Deploy op Vercel

De repo staat op GitHub ([Kreatives/ecosystem](https://github.com/Kreatives/ecosystem)).

1. [vercel.com](https://vercel.com) → **Add New… → Project** → importeer de repo. Framework
   (Next.js) wordt automatisch herkend.
2. Zet onder **Settings → Environment Variables** alle sleutels uit de tabel hierboven
   (dezelfde als `.env.local`). `DEEPAPI_API_KEY` is niet nodig.
3. **Deploy.** Dat is alles.

Details die al goed staan:
- Screenshots draaien op Vercel via `@sparticuz/chromium` (automatisch herkend aan de
  `VERCEL`-omgeving); lokaal via de volledige Playwright-installatie.
- De run draait als één streaming-request (`/api/run/stream`, `maxDuration` 300s), dus er is
  geen aparte worker nodig. `vercel.json` geeft die functie 2 GB geheugen voor Chromium.
- **Grote runs kun je het best lokaal draaien** (`npm run dev`, geen tijdslimiet). Op Vercel
  moet een run binnen ~300s klaar zijn; de volledige analyse kost ~1 min per lead, dus houd het
  aantal per run bescheiden (±3–5). Wordt de limiet gehaald, dan schrijft die run niets weg —
  draai 'm dan lokaal of kleiner. De Kanban, Vandaag en statistieken hebben deze limiet niet.

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
