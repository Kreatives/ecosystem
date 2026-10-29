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
  const system = `Je analyseert de website van een lead voor KREATIVES (webdesignbureau). Noem concrete, controleerbare pijnpunten op basis van wat er echt op de site staat. Verzin niets; staat iets er niet, benoem het niet.

Geef 5 pijnpunten in deze prioriteitsvolgorde (contrast is geen prioriteit):
1. hero (vertrouwen + slogan)
2. social proof (aanwezig? juiste soort voor de niche?)
3. sectievolgorde van boven naar beneden
4. overtuigingskracht (staat er genoeg om iemand te overtuigen)
5. uitstraling/verouderd

Antwoord UITSLUITEND met JSON:
{"pijnpunten": string[], "compliment": string}
- pijnpunten: precies 5 punten in bovenstaande volgorde, elk een observatie + de concrete consequentie voor de lead, in 1 of 2 korte zinnen, zodat het direct in een bericht past. Kort en to the point.
- compliment: 1 echt, specifiek compliment over het bedrijf uit de site. Leeg als je niets echts vindt.
Alles in het Nederlands, geen gedachtestreepjes, geen "geen X maar Y".`;

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

  const concurrenten = lead.website ? await vindConcurrenten(lead, siteTekst, niche).catch(() => []) : [];
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
