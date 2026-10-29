import { ask, askJson } from './anthropic';
import type { DbType } from './env';
import type { RawLead } from './apify';

export type Bericht = { label: string; tekst: string };
export type Berichten = { kanaal: 'LinkedIn' | 'Instagram'; items: Bericht[] };

const firstName = (full?: string) => (full || '').trim().split(/\s+/)[0] || '';

/** Haalt de context uit de site die de flow nodig heeft (voornaam, en bij partners
 *  wat ze doen + wie hun klanten zijn). Verzint niets: leeg = placeholder. */
async function context(
  type: DbType,
  lead: RawLead,
  siteTekst: string,
): Promise<{ voornaam: string; watZijDoen: string; hunKlanten: string }> {
  const fallbackNaam = firstName(lead.contactpersoon);
  if (!siteTekst) return { voornaam: fallbackNaam, watZijDoen: '', hunKlanten: '' };

  const system =
    type === 'partner'
      ? `Lees de site-tekst en haal er feitelijk uit (verzin niets, leeg laten als onbekend). Antwoord UITSLUITEND met JSON: {"voornaam": string, "watZijDoen": string, "hunKlanten": string}
- voornaam: voornaam van de eigenaar/oprichter als die duidelijk op de site staat, anders "".
- watZijDoen: hun dienst in hun eigen woorden, kort (bijv. "campagnes", "sales-trainingen", "Google Ads").
- hunKlanten: het type bedrijf dat zij bedienen zoals zichtbaar op de site (bijv. "adviesbureaus en B2B-dienstverleners").`
      : `Lees de site-tekst en haal de voornaam van de eigenaar/contactpersoon eruit als die duidelijk op de site staat (verzin niets). Antwoord UITSLUITEND met JSON: {"voornaam": string}`;

  const j = await askJson<any>(system, [{ type: 'text', text: siteTekst.slice(0, 5000) }], {}, 300);
  // Claude geeft soms "onbekend"/"-" terug i.p.v. leeg: behandel dat als niet gevonden.
  const schoon = (s: string) => {
    const v = (s || '').trim();
    return /^(onbekend|geen|n\.?v\.?t\.?|-|null)$/i.test(v) ? '' : v;
  };
  return {
    voornaam: schoon(j.voornaam) || fallbackNaam,
    watZijDoen: schoon(j.watZijDoen),
    hunKlanten: schoon(j.hunKlanten),
  };
}

/** Bouwt de volledige outreach-sequence volgens flow-klant.md / flow-partner.md.
 *  Alleen de placeholders worden gevuld; de opbouw blijft exact. */
export async function schrijfBerichten(
  type: DbType,
  lead: RawLead,
  siteTekst: string,
  compliment: string,
  pijnpunten: string[],
  platform: 'linkedin' | 'instagram' | 'beide',
): Promise<Berichten> {
  const ctx = await context(type, lead, siteTekst);
  const naam = ctx.voornaam || '{voornaam}';
  const comp = compliment || '{compliment over het bedrijf}';
  const pp = pijnpunten.length ? pijnpunten : ['{observatie + consequentie}'];

  if (type === 'partner') {
    const watDoen = ctx.watZijDoen || '{wat zij doen}';
    const klanten = ctx.hunKlanten || '{hun klanten}';
    return {
      kanaal: 'LinkedIn',
      items: [
        {
          label: 'Day 1 — Connectieverzoek',
          tekst: `Hoi ${naam}, ik bouw websites voor ${klanten} en kom jullie bureau regelmatig tegen bij dat soort bedrijven. Lijkt me goed om elkaar te kennen. Groet, Ricky`,
        },
        {
          label: 'Day 2 — Voorstel',
          tekst: `Ik val maar gelijk met de deur in huis.\n\nJullie draaien ${watDoen} voor bedrijven waar de website vaak de zwakke plek is.\n\nIk bouw precies die websites: voor ${klanten}, vaste prijs, live in vier weken, ontwerp goedgekeurd voordat er gebouwd wordt.\n\nAls een klant van jullie een nieuwe site of landingspagina nodig heeft, pak ik dat op.\n\nJullie klant blijft jullie klant, en jullie krijgen 15% van elk project dat uit jullie koker komt.\n\nOp het eerste project 25%, zodat het meteen de moeite is.`,
        },
        {
          label: 'Geen reactie (na Day 2)',
          tekst: `Hoi ${naam}, nog even kort wat je van mij kunt verwachten als je een klant doorstuurt: ik kom bij het eerste gesprek langs, de klant ziet het ontwerp voor de bouw en heeft drie revisierondes, en jij krijgt na oplevering een berichtje met hoe het liep.\n\nWil je het liever onder eigen naam aanbieden, dan kan dat ook.\n\nHier staat wat ik bouw: {link naar twee relevante cases}. Als het nu niet speelt, hoor ik het ook graag.`,
        },
      ],
    };
  }

  // ----- KLANT -----
  const instagram = platform === 'instagram';
  if (instagram) {
    // Instagram: luchtiger en korter, "Hey/Yo", max 3-4 zinnen, geen Day 1.
    const system = `Je schrijft Instagram-outreach voor Ricky (webdesigner). Houd je EXACT aan deze opbouw per bericht, luchtig en kort (max 3-4 korte zinnen), opening "Hey" of "Yo", nooit "Goedemiddag". Geen gedachtestreepjes, geen "geen X maar Y", geen uitroeptekens-feest.

Lever 5 Day-2-varianten, één per meegegeven pijnpunt, volgens dit sjabloon (vul {naam}, {compliment} kort, {observatie}):
"Hey {naam}, zag jullie pagina en heb even op de site gekeken. {compliment kort}
Eén ding viel me op: {observatie + consequentie kort}
Zal ik de rest in een filmpje van 3 min doorsturen? Kun je zelf oppakken, geen verplichting."

Antwoord UITSLUITEND met JSON: {"varianten": string[5]}`;
    const j = await askJson<{ varianten: string[] }>(
      system,
      [{ type: 'text', text: `Naam: ${naam}\nCompliment: ${comp}\nPijnpunten:\n${pp.map((p, i) => `${i + 1}. ${p}`).join('\n')}` }],
      { varianten: [] },
      1200,
    );
    const varianten = (j.varianten || []).length ? j.varianten : pp.map((p) => `Hey ${naam}, zag jullie pagina en heb even op de site gekeken. ${comp}\nEén ding viel me op: ${p}\nZal ik de rest in een filmpje van 3 min doorsturen? Kun je zelf oppakken, geen verplichting.`);
    return {
      kanaal: 'Instagram',
      items: [
        ...varianten.slice(0, 5).map((v, i) => ({ label: `Day 2 — variant ${i + 1}`, tekst: v })),
        { label: 'Day 3 — geen reactie', tekst: `Hey ${naam}, nog één ding dat me opviel: ${pp[1] || pp[0]}\nZal ik die video alsnog maken?` },
        { label: 'Day 4 — call', tekst: `Zin om samen even door de site te lopen? 30 min, dan hoor je eerlijk of een kleine ingreep genoeg is. Past {dag} of {dag}?` },
      ],
    };
  }

  // LinkedIn (standaard voor klant): vaste opbouw, 5 Day-2-varianten.
  const day2 = (obs: string) =>
    `Hey ${naam}, ik was nieuwsgierig en heb even op jullie site gekeken.\n\n${comp}\n\nWat me opviel: ${obs}\n\nIk heb nog een aantal andere punten op de website gevonden. Zal ik ze in een korte video (3 min) voor je doorlopen?\n\nJe kunt ze zelf oppakken en er zit geen verplichting aan :)`;

  const items: Bericht[] = [
    { label: 'Day 1 — Na connectie', tekst: `Hey ${naam}, bedankt voor de connectie!` },
    ...pp.slice(0, 5).map((p, i) => ({ label: `Day 2 — variant ${i + 1}`, tekst: day2(p) })),
    {
      label: 'Day 3 — bij reactie',
      tekst: `Hierbij: {link}.\n\nDrie punten, alle drie kun je laten aanpassen door wie jullie site nu beheert.\n\nIk heb ook kort laten zien hoe {concurrent} het oplost, puur ter vergelijking.\n\nBen benieuwd wat je ervan vindt.`,
    },
    {
      label: 'Day 3 — geen reactie',
      tekst: `Hey ${naam}, nog één ding dat ik zag: ${pp[1] || pp[0]}.\n\nZal ik die video alsnog maken?`,
    },
    {
      label: 'Day 4 — Call-voorstel',
      tekst: `Als je wilt kijken wat er nodig is om de site echt op het niveau van jullie werk te krijgen, plan ik graag 30 minuten in.\n\nDan loop ik de hele site door in plaats van drie punten, en je hoort eerlijk of een kleine ingreep genoeg is of niet. Past {dag} of {dag}?`,
    },
  ];
  return { kanaal: 'LinkedIn', items };
}
