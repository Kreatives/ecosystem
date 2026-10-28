/**
 * Eenmalige, idempotente migratie van "Outreach (Partners)" (expliciet akkoord Ricky):
 *   1. voeg property `Date` (date) toe als die ontbreekt;
 *   2. zet de `Status`-opties gelijk aan Clients
 *      (Nog niet gestart, Day 1..Day 4, Geen reactie, Afgerond);
 *   3. bestaande pagina's met een oude status → "Nog niet gestart".
 * Verder wordt niets gewijzigd. Geen Gesprek, geen EXTRA.
 *
 * Draaien:  set -a; source .env.local; set +a; npx tsx scripts/migrate-partners-db.ts
 */
const TOKEN = process.env.NOTION_TOKEN!;
const DB = process.env.NOTION_PARTNER_DATABASE_ID!;
const V = "2022-06-28";

const TARGET_STATUS = [
  "Nog niet gestart",
  "Day 1",
  "Day 2",
  "Day 3",
  "Day 4",
  "Geen reactie",
  "Afgerond",
];

async function api(path: string, method: string, body?: any) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": V,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.message || ""}`);
  return json;
}

async function main() {
  if (!TOKEN || !DB) throw new Error("NOTION_TOKEN of NOTION_PARTNER_DATABASE_ID ontbreekt.");
  const db: any = await api(`databases/${DB}`, "GET");
  const props = db.properties;
  console.log("DB:", db.title?.map((t: any) => t.plain_text).join("") || DB);

  // 1) Date toevoegen
  if (!props.Date) {
    await api(`databases/${DB}`, "PATCH", { properties: { Date: { date: {} } } });
    console.log("✓ Property 'Date' toegevoegd.");
  } else {
    console.log("• 'Date' bestond al.");
  }

  // 2a) union-opties zodat 'Nog niet gestart' bestaat voordat we pagina's omzetten
  const current: string[] = (props.Status?.select?.options || []).map((o: any) => o.name);
  const union = Array.from(new Set([...current, ...TARGET_STATUS]));
  if (union.length !== current.length) {
    await api(`databases/${DB}`, "PATCH", {
      properties: { Status: { select: { options: union.map((name) => ({ name })) } } },
    });
    console.log("✓ Nieuwe status-opties toegevoegd:", union.filter((n) => !current.includes(n)));
  }

  // 2b) pagina's met oude status → 'Nog niet gestart'
  let cursor: string | undefined;
  let moved = 0;
  do {
    const page: any = await api(`databases/${DB}/query`, "POST", {
      page_size: 100,
      start_cursor: cursor,
    });
    for (const p of page.results) {
      const s = p.properties?.Status?.select?.name;
      if (s && !TARGET_STATUS.includes(s)) {
        await api(`pages/${p.id}`, "PATCH", {
          properties: { Status: { select: { name: "Nog niet gestart" } } },
        });
        moved++;
      }
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  if (moved) console.log(`✓ ${moved} pagina('s) met oude status → 'Nog niet gestart'.`);

  // 2c) opties exact gelijk aan Clients zetten (oude, nu ongebruikte opties verdwijnen)
  await api(`databases/${DB}`, "PATCH", {
    properties: { Status: { select: { options: TARGET_STATUS.map((name) => ({ name })) } } },
  });
  console.log("✓ Status-opties gelijkgetrokken met Clients:", TARGET_STATUS.join(", "));

  console.log("\nKlaar. Partners-DB staat gelijk aan de Clients-flow (zonder Gesprek/EXTRA).");
}

main().catch((e) => {
  console.error("Migratie mislukt:", e.message);
  process.exit(1);
});
