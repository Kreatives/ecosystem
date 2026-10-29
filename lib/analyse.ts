import { ask } from './anthropic';
import type { RawLead } from './apify';
import type { QualifyResult } from './qualify';

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
