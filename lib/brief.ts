import { ask } from './anthropic';
import type { DbType } from './env';

// Bestaande Notion-niche-opties. Claude mapt elke run naar de dichtstbijzijnde;
// de rest wordt "Overig" (geen nieuwe opties aanmaken).
export const CLIENT_NICHES = [
  'Tandartsen', 'Renovatie', 'Eventlocatie', 'Reisbureau', 'Coaching / Personal brand', 'Educatie', 'Overig',
] as const;
export const PARTNER_NICHES = ['Marketingbureau', 'SEO Agency', 'Overig'] as const;

export type Source = 'linkedin' | 'instagram' | 'google-maps';

export type Plan = {
  samenvatting: string;
  label: string;
  omschrijving: string;
  regio: string;
  notionNiche: string;
  sources: Source[];
  linkedinQuery: string;
  instagramTerms: string[];
  mapsTerms: string[];
  minVolgers?: number;
  minReviews?: number;
};

/**
 * Zet de vrije opdracht + gekozen type/platform om in een concreet zoekplan.
 * Platform bepaalt welke bronnen draaien; "beide" = LinkedIn + Instagram.
 */
export async function interpreteerBrief(
  brief: string,
  type: DbType,
  platform: 'linkedin' | 'instagram' | 'beide',
): Promise<Plan> {
  const niches = type === 'partner' ? PARTNER_NICHES : CLIENT_NICHES;
  const sources: Source[] =
    platform === 'linkedin' ? ['linkedin'] : platform === 'instagram' ? ['instagram'] : ['linkedin', 'instagram'];

  const partnerContext =
    type === 'partner'
      ? 'LET OP: je zoekt STRATEGISCHE PARTNERS voor KREATIVES (marketingbureaus, sales-trainers, Google Ads-bureaus, CRM-leveranciers, accountants, fotografen, brandingstudio\'s) die zelf GEEN websites bouwen. Richt de zoektermen op dat soort bureaus en hun beslissers.'
      : 'Je zoekt KLANTEN: B2B-dienstverleners en consultancybedrijven (5-30 medewerkers, 5+ jaar), sales-trainers, marketingadviseurs, recruitment/HR, organisatieadvies, B2B-opleiders. Solo-coaches mogen mee.';

  const system = `Je bent de zoek-strateeg van KREATIVES, een Nederlands webdesignbureau. Je zet een vrije opdracht om in een concreet zoekplan. ${partnerContext}

De gebruiker heeft deze bronnen gekozen: ${sources.join(', ')}. Vul alleen zoektermen in voor die bronnen.
- linkedin: HEEL KORTE rol-zoekterm (2-3 woorden), bijv. "eigenaar adviesbureau".
- instagram: 2-4 woorden zoals in de IG-zoekbalk, voeg vaak "nederland"/"nl"/een plaats toe.
- google-maps: "vakterm plaats" (alleen als de opdracht duidelijk om lokale bedrijven met een pand vraagt).

De Niche moet exact een van deze zijn: ${niches.join(', ')}.

Antwoord UITSLUITEND met JSON:
{
  "samenvatting": string,        // 1 zin: wat je begreep
  "label": string,               // korte naam doelgroep
  "omschrijving": string,        // 1-2 zinnen: wie is de ideale lead, voor de scoring
  "regio": string,               // regio/plaats indien genoemd, anders ""
  "notionNiche": string,         // exact een uit de lijst
  "linkedinQuery": string,       // 2-3 woorden, leeg als linkedin geen bron is
  "instagramTerms": string[],    // 3-6 termen, leeg als instagram geen bron is
  "mapsTerms": string[],         // leeg tenzij google-maps zinvol is
  "minVolgers": number | null,   // alleen bij instagram indien genoemd
  "minReviews": number | null    // alleen bij maps indien genoemd
}`;

  try {
    const out = await ask(system, [{ type: 'text', text: `Opdracht: ${brief}` }], 900);
    const j = JSON.parse(out);
    const notionNiche = (niches as readonly string[]).includes(j.notionNiche) ? j.notionNiche : 'Overig';
    // google-maps alleen toevoegen als Claude er termen voor gaf
    const finalSources = [...sources];
    if (Array.isArray(j.mapsTerms) && j.mapsTerms.length && !finalSources.includes('google-maps')) {
      finalSources.push('google-maps');
    }
    return {
      samenvatting: j.samenvatting || '',
      label: j.label || 'Leads',
      omschrijving: j.omschrijving || brief,
      regio: j.regio || '',
      notionNiche,
      sources: finalSources,
      linkedinQuery: j.linkedinQuery || '',
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
      sources,
      linkedinQuery: brief.split(/\s+/).slice(0, 3).join(' '),
      instagramTerms: [],
      mapsTerms: [],
    };
  }
}
