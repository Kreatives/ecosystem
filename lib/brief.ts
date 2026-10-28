import { ask } from './anthropic';
import type { DbType } from './env';

// Bestaande Notion-niche-opties. Claude mapt elke run naar de dichtstbijzijnde;
// de rest wordt "Overig" (geen nieuwe opties aanmaken).
export const CLIENT_NICHES = [
  'Tandartsen', 'Renovatie', 'Eventlocatie', 'Reisbureau', 'Coaching / Personal brand', 'Educatie', 'Overig',
] as const;
export const PARTNER_NICHES = ['Marketingbureau', 'SEO Agency', 'Overig'] as const;

export type Source = 'google-maps' | 'instagram';

export type Plan = {
  samenvatting: string;
  label: string;
  omschrijving: string;
  regio: string;
  notionNiche: string;
  sources: Source[];
  instagramTerms: string[];
  mapsTerms: string[];
  minVolgers?: number;
  minReviews?: number;
};

/**
 * Zet de vrije opdracht + type om in een zoekplan. Discovery loopt via de bronnen
 * die een WEBSITE opleveren: Google Maps voor bedrijven (met een pand/website) en
 * Instagram voor personal brands (website via de bio-link). LinkedIn is geen
 * discovery-bron (levert geen site); het platform bepaalt alleen waar je straks
 * benadert, en die outreach-link halen we van de site.
 */
export async function interpreteerBrief(
  brief: string,
  type: DbType,
  platform: 'linkedin' | 'instagram' | 'beide',
): Promise<Plan> {
  const niches = type === 'partner' ? PARTNER_NICHES : CLIENT_NICHES;

  const partnerContext =
    type === 'partner'
      ? 'Je zoekt STRATEGISCHE PARTNERS voor KREATIVES (marketingbureaus, sales-trainers, Google Ads-bureaus, CRM-leveranciers, accountants, fotografen, brandingstudio\'s) die zelf GEEN websites bouwen. Dit zijn bedrijven met een eigen website: gebruik vrijwel altijd Google Maps.'
      : 'Je zoekt KLANTEN: B2B-dienstverleners en consultancybedrijven (5-30 medewerkers, 5+ jaar), sales-trainers, marketingadviseurs, recruitment/HR, organisatieadvies, B2B-opleiders. Dit zijn bedrijven met een eigen website en vaak een kantoor: gebruik Google Maps. Alleen bij pure personal brands/coaches gebruik je Instagram.';

  const system = `Je bent de zoek-strateeg van KREATIVES, een Nederlands webdesignbureau. Je zet een vrije opdracht om in een concreet zoekplan dat leads mét een website oplevert. ${partnerContext}

Kies per opdracht de beste bron(nen):
- "google-maps": bedrijven met een pand en een website (adviesbureaus, consultants, bureaus, klinieken, dienstverleners). Zoektermen zijn "vakterm plaats", bijv. "organisatieadviesbureau Utrecht".
- "instagram": alleen pure personal brands/coaches zonder kantoor. Zoektermen zijn 2-4 woorden zoals in de IG-zoekbalk, met "nederland"/"nl"/een plaats.

De Niche moet exact een van deze zijn: ${niches.join(', ')}.

Antwoord UITSLUITEND met JSON:
{
  "samenvatting": string,        // 1 zin: wat je begreep
  "label": string,               // korte naam doelgroep
  "omschrijving": string,        // 1-2 zinnen: wie is de ideale lead, voor de scoring
  "regio": string,               // regio/plaats indien genoemd, anders ""
  "notionNiche": string,         // exact een uit de lijst
  "sources": string[],           // ["google-maps"] en/of ["instagram"]
  "mapsTerms": string[],         // 5-10 "vakterm plaats"-termen, leeg als geen maps
  "instagramTerms": string[],    // 3-6 termen, leeg als geen instagram
  "minVolgers": number | null,   // alleen bij instagram indien genoemd
  "minReviews": number | null    // alleen bij maps indien genoemd (meestal null; B2B heeft weinig reviews)
}`;

  try {
    const out = await ask(system, [{ type: 'text', text: `Opdracht: ${brief}\nGekozen outreach-platform: ${platform}` }], 900);
    const j = JSON.parse(out);
    const notionNiche = (niches as readonly string[]).includes(j.notionNiche) ? j.notionNiche : 'Overig';
    let sources: Source[] = Array.isArray(j.sources)
      ? j.sources.filter((s: string) => s === 'google-maps' || s === 'instagram')
      : [];
    if (!sources.length) sources = ['google-maps'];
    return {
      samenvatting: j.samenvatting || '',
      label: j.label || 'Leads',
      omschrijving: j.omschrijving || brief,
      regio: j.regio || '',
      notionNiche,
      sources,
      instagramTerms: Array.isArray(j.instagramTerms) ? j.instagramTerms.filter(Boolean) : [],
      mapsTerms: Array.isArray(j.mapsTerms) ? j.mapsTerms.filter(Boolean) : [],
      minVolgers: j.minVolgers ?? undefined,
      minReviews: j.minReviews ?? undefined,
    };
  } catch {
    return {
      samenvatting: 'Kon de opdracht niet automatisch lezen; probeer het concreter.',
      label: 'Leads',
      omschrijving: brief,
      regio: '',
      notionNiche: 'Overig',
      sources: ['google-maps'],
      instagramTerms: [],
      mapsTerms: [brief],
    };
  }
}
