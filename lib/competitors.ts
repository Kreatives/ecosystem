import { askWeb } from './anthropic';
import type { RawLead } from './apify';

export type Concurrent = {
  naam: string;
  url: string;
  land: 'NL' | 'buitenland';
  beter: string;
  zwakker: string;
  aanvalszin: string;
  bestFit?: boolean;
};

/**
 * Zoekt via web search 3 Nederlandse + 3 buitenlandse concurrenten van de lead
 * en levert per concurrent: wat zij beter/slechter doen en een aanvalszin, in het
 * marktonderzoek-formaat uit ICP.md. Markeert de best passende voor de Loom.
 */
export async function vindConcurrenten(lead: RawLead, siteTekst: string, niche: string): Promise<Concurrent[]> {
  const system = `Je doet concurrentie-onderzoek voor KREATIVES, een Nederlands webdesignbureau. Voor een lead zoek je ECHTE concurrenten van die lead (zelfde vakgebied/branche, niet webdesignbureaus), zodat Ricky in zijn Loom-video kan laten zien hoe een concurrent het online beter aanpakt.

Zoek met web search 3 Nederlandse en 3 buitenlandse concurrenten van de lead. Per concurrent, kijk naar hun WEBSITE en bepaal:
- wat zij online/op hun site beter doen (concreet: social proof, cijfers, structuur, uitstraling),
- wat zij zwakker doen,
- één aanvalszin die Ricky in de Loom kan zeggen (stijl: eerlijk, concreet, zoals een ondernemer; geen gedachtestreepjes, geen "geen X maar Y").

Markeer welke ene concurrent het best past om in de Loom te tonen (bestFit: true).

Verzin geen URL's of feiten; gebruik wat je via de zoekresultaten echt vindt. Antwoord, NA het zoeken, UITSLUITEND met JSON (geen uitleg eromheen):
{"concurrenten":[{"naam":string,"url":string,"land":"NL"|"buitenland","beter":string,"zwakker":string,"aanvalszin":string,"bestFit":boolean}]}`;

  const user = `Lead: ${lead.naam}\nWebsite: ${lead.website}\nNiche: ${niche}\nPlaats: ${lead.plaats || 'onbekend'}\n\nKorte site-indruk:\n${siteTekst.slice(0, 1500)}`;

  try {
    const out = await askWeb(system, user, 6, 3000);
    // pak het JSON-object uit de tekst (soms staat er nog tekst omheen)
    const m = out.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : out);
    const lijst: Concurrent[] = Array.isArray(j.concurrenten) ? j.concurrenten : [];
    return lijst
      .filter((c) => c.naam && c.url)
      .map((c) => ({
        naam: c.naam,
        url: c.url,
        land: c.land === 'buitenland' ? 'buitenland' : 'NL',
        beter: c.beter || '',
        zwakker: c.zwakker || '',
        aanvalszin: c.aanvalszin || '',
        bestFit: Boolean(c.bestFit),
      }));
  } catch {
    return [];
  }
}
