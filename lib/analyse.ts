import { ask, askJson } from './anthropic';
import type { RawLead } from './apify';
import type { QualifyResult } from './qualify';
import { vindConcurrenten, type Concurrent } from './competitors';
import { maakScreenshots } from './screenshots';

/**
 * Basis-website-analyse zonder Deep API: drie concrete pijnpunten + een compliment,
 * uit de homepage-tekst. De volledige analyse (5 geprioriteerde pijnpunten,
 * concurrenten NL + buitenland, Loom-bullets, screenshots) volgt in fase 2 met
 * Deep API en de outreach-02-analyse-skill.
 */
export async function analyseerBasis(
  lead: RawLead,
  siteTekst: string,
  q: QualifyResult,
): Promise<Partial<QualifyResult>> {
  if (!siteTekst) return {};
  const system = `Je analyseert de website van een lead voor KREATIVES (webdesignbureau). De kern is altijd: dit bedrijf is goed, maar de website laat dat niet zien. Verzin NOOIT reviews, cijfers, klanten of jaartallen; gebruik alleen wat echt op de site staat.

COMPLIMENT: één echt, concreet compliment over het BEDRIJF zelf (voor een aparte sectie), nooit over de website of de teksten. Feiten: sinds welk jaar, bekende klanten/merken, specialismen, teamomvang, awards. Leeg laten als je niets echts vindt.

PIJNPUNTEN (dit is het belangrijkst): precies 5 observaties, elk in EXACT deze stijl:
"Ik zag dat [concreet, controleerbaar sterk punt van het bedrijf], maar [de site laat dat niet zien / concrete zwakte]."

Begin ELK punt met een echt pluspunt mét bewijs, en varieer dat bewijs over de 5 punten: Google-review-score + aantal (bv. "5,0 uit 72 reviews"), met naam genoemde klanten/merken (bv. "ABN AMRO, Triodos, Booking.com"), aantallen ("2.000 professionals begeleid", "50+ organisaties", "sinds 2010"), awards of keurmerken, specialismen. Zet dat tegenover wat de site mist, in deze prioriteit: 1) hero/vertrouwen, 2) social proof, 3) sectievolgorde, 4) overtuigingskracht, 5) uitstraling. Elk punt 1 zin, hooguit 2. Direct kopieerbaar als bericht. Heel af en toe mag een losse 😅 achteraan, niet bij elk punt.

Voorbeeld van de exacte stijl:
"Ik zag dat je 5,0 op Google uit 72 recensies hebt en klanten als ABN AMRO en Booking.com begeleidt, maar de site laat die autoriteit nu niet zien."

Heeft de site geen enkel hard bewijs (geen reviews, klanten, cijfers, jaartallen)? Gebruik dan het sterkste dat er wél staat (een duidelijk specialisme of aanpak), maar verzin nooit cijfers.

Antwoord UITSLUITEND met JSON:
{"pijnpunten": string[], "compliment": string}
Alles in het Nederlands, geen gedachtestreepjes, geen "geen X maar Y", geen bureautaal.`;

  try {
    const out = await ask(
      system,
      [{ type: 'text', text: `Bedrijf: ${lead.naam}\n\nWebsite-tekst (afgekapt):\n${siteTekst.slice(0, 6000)}` }],
      800,
    );
    const j = JSON.parse(out);
    return {
      pijnpunten: Array.isArray(j.pijnpunten) ? j.pijnpunten.filter(Boolean).slice(0, 5) : undefined,
      compliment: j.compliment || q.compliment,
    };
  } catch {
    return {};
  }
}

/** Loom-bullets (±3 min video): hero → sectievolgorde → social proof → wat verder
 *  opvalt → hoe concurrent X het oplost. Alleen punten, geen script. */
async function loomBullets(lead: RawLead, pijnpunten: string[], best?: Concurrent): Promise<string[]> {
  const system = `Je maakt een bulletlijst voor een Loom-video van ±3 minuten over de website van een lead. Volgorde: hero → sectievolgorde → social proof → wat verder opvalt → hoe de concurrent het oplost. Alleen korte bullets, geen uitgeschreven script, geen gedachtestreepjes. Antwoord UITSLUITEND met JSON: {"bullets": string[]}`;
  const user = `Bedrijf: ${lead.naam}\nPijnpunten:\n${pijnpunten.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nBest passende concurrent: ${best ? `${best.naam} (${best.url}) — ${best.beter}` : 'onbekend'}`;
  const j = await askJson<{ bullets: string[] }>(system, [{ type: 'text', text: user }], { bullets: [] }, 700);
  return (j.bullets || []).filter(Boolean).slice(0, 8);
}

export type VolledigeAnalyse = {
  pijnpunten: string[];
  compliment: string;
  concurrenten: Concurrent[];
  loomBullets: string[];
  screenshotDesktop: string;
  screenshotMobiel: string;
};

/**
 * De volledige website-analyse (fase 2): 5 pijnpunten + compliment, 3 NL + 3
 * buitenlandse concurrenten (web search), Loom-bullets en screenshots
 * (desktop + mobiel). Elk onderdeel is best-effort: faalt er één, dan gaat de
 * rest door. Geen Deep API nodig.
 */
export async function analyseerVolledig(
  lead: RawLead,
  siteTekst: string,
  q: QualifyResult,
  niche: string,
): Promise<VolledigeAnalyse> {
  const basis = await analyseerBasis(lead, siteTekst, q);
  const pijnpunten = basis.pijnpunten || q.pijnpunten || [];
  const compliment = basis.compliment || q.compliment || '';

  // Concurrenten (web search) is de duurste stap. Uit te zetten met ANALYSE_CONCURRENTEN=0.
  const doeConcurrenten = process.env.ANALYSE_CONCURRENTEN !== '0';
  const concurrenten = doeConcurrenten && lead.website ? await vindConcurrenten(lead, siteTekst, niche).catch(() => []) : [];
  const best = concurrenten.find((c) => c.bestFit) || concurrenten[0];
  const bullets = pijnpunten.length ? await loomBullets(lead, pijnpunten, best).catch(() => []) : [];
  const shots = lead.website ? await maakScreenshots(lead.website, lead.naam).catch(() => ({ desktop: '', mobiel: '' })) : { desktop: '', mobiel: '' };

  return {
    pijnpunten,
    compliment,
    concurrenten,
    loomBullets: bullets,
    screenshotDesktop: shots.desktop,
    screenshotMobiel: shots.mobiel,
  };
}
