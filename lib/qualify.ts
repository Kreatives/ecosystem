import { ask } from './anthropic';
import type { RawLead } from './apify';

export type QualifyResult = {
  score: number; // 0-10, 1 decimaal
  onderbouwing: string; // 3-5 regels, komt in de Notion-pagina
  niche: string;
  skip: boolean; // true = weggooien (onder 6 of skip-regel)
  skipReden?: string;
  compliment?: string;
  pijnpunten?: string[]; // basis-analyse (fase 2 = volledige analyse)
};

/**
 * Klant-qualifier volgens ICP.md: 40% profielfit, 30% koopsignalen, 30% website-zwakte,
 * met de skip-regels (high-end site of recent door een serieus bureau → weggooien).
 */
export async function kwalificeerKlant(
  lead: RawLead,
  siteTekst: string,
  screenshotUrl: string,
  niche: string,
  omschrijving: string,
): Promise<QualifyResult> {
  const system = `Je kwalificeert een KLANT-lead voor KREATIVES, een Nederlands webdesignbureau (maatwerk websites EUR 5.000 - 12.000). Doelgroep: ${omschrijving}

Geef een score van 0 tot 10 (1 decimaal), opgebouwd uit drie delen:

1) PROFIELFIT (40%, dus 0-4): B2B-dienstverlener/consultancy. Medewerkers 5-30 is ideaal (minder of veel meer = minder punten). Bedrijfsleeftijd 5+ jaar ideaal; onder 2 jaar is een zwaar minpunt tenzij aantoonbaar hard gegroeid. Eigenaar/DGA vindbaar op LinkedIn is een plus. Geschatte omzet schat je via medewerkers x branche, alleen als signaal, nooit als harde grens. Randstad is een klein pluspunt, geen filter. Solo-coaches mogen mee. Installatie/techniek 10+ man is bijvangst: score maximaal 7.

2) KOOPSIGNALEN (30%, dus 0-3): nieuwe marketingvacature, recent een marketingbureau of partner aangenomen, lopende advertenties die naar een zwakke landingspagina leiden, aantoonbare groei. Geen enkel signaal = 0.

3) WEBSITE-ZWAKTE (30%, dus 0-3): verouderde uitstraling, geen bewijs/cijfers/resultaten, verkeerde sectievolgorde, hero zonder vertrouwen of slogan. Hoe zwakker de site bij een sterk bedrijf, hoe hoger. Een al sterke site = 0.

SKIP-REGELS (dan score < 6 en skip = true):
- De site is duidelijk high-end: sterke branding, GSAP/scroll-animaties, echt maatwerk.
- In de footer staat "gemaakt door [bureau]" en dat is een groot/bekend bureau.
- De site is recent (< 1 jaar) gebouwd door een serieus bureau: zwaar minpunt.

Verzin nooit feiten. Wat je niet ziet is onbekend; scoor dan conservatief. Antwoord UITSLUITEND met JSON:
{"score": number, "onderbouwing": string, "compliment": string, "skip": boolean, "skipReden": string}
- onderbouwing: 3 tot 5 regels met concrete, controleerbare observaties (bouwjaar footer, aantal medewerkers, staat van de site, vacature). Benoem per deel kort de score.
- compliment: 1 echt, specifiek compliment over het bedrijf uit de site. Leeg als je niets echts vindt.
- skip: true alleen bij een skip-regel of score < 6. skipReden: 1 zin, anders leeg.
Alles in het Nederlands.`;

  const content: any[] = [
    {
      type: 'text',
      text: `Leadgegevens:\n${JSON.stringify(lead, null, 2)}\n\nWebsite-tekst (afgekapt):\n${
        siteTekst.slice(0, 6000) || '(geen website-inhoud opgehaald)'
      }`,
    },
  ];
  if (screenshotUrl) {
    content.push({ type: 'text', text: 'Screenshot van de huidige homepage, beoordeel het ontwerp hierop:' });
    content.push({ type: 'image', source: { type: 'url', url: screenshotUrl } });
  }

  try {
    const out = await ask(system, content, 1100);
    const j = JSON.parse(out);
    const score = Number(j.score) || 0;
    return {
      score,
      onderbouwing: j.onderbouwing || '',
      niche,
      skip: Boolean(j.skip) || score < 6,
      skipReden: j.skipReden || (score < 6 ? 'score onder 6' : undefined),
      compliment: j.compliment || '',
    };
  } catch {
    return { score: 0, onderbouwing: 'Kwalificatie mislukt.', niche, skip: true, skipReden: 'parse-fout' };
  }
}

/** Partner-qualifier: hergebruikt de bestaande logica. Hoofdregel: maakt zelf GEEN websites. */
export async function kwalificeerPartner(
  lead: RawLead,
  siteTekst: string,
  screenshotUrl: string,
): Promise<QualifyResult & { niche: string }> {
  const system = `Je kwalificeert een potentiele STRATEGISCHE PARTNER voor KREATIVES, een Nederlands webdesignbureau (maatwerk websites vanaf EUR 5.000). Een partner heeft het vertrouwen van onze ideale klant (B2B-dienstverleners/consultancy), levert een aanvullende dienst, en bouwt zelf GEEN websites. Denk aan marketingbureaus, sales-trainers, SEO/ads-specialisten, CRM-leveranciers, accountants, fotografen, brandingstudio's, communities.

HARDE DISKWALIFICATIES (score max 2, skip = true):
- Biedt zelf websites/webdesign/landingspagina's/webshops/WordPress/Shopify/Webflow aan, ook als bijdienst → zet in skipReden waar je het zag.
- Te beginnend (< 2 jaar, nauwelijks cases, solo zonder vaste klanten), inactief (12+ mnd niets), of bedient de Nederlandse markt niet.

SCORECARD (0-10):
1. Vertrouwen van de ICP (0-3): werken ze met bedrijven die EUR 5.000+ in een site kunnen investeren? Herkenbare klanten, cases met naam en resultaat.
2. Win-win, hun resultaat hangt af van de website (0-2,5): ads, SEO, funnels, leadgeneratie hoog; branding zonder conversiedoel midden.
3. Volwassenheid (0-2,5): jaren actief, team, aantal cases.
4. Kanaal en bereik (0-2): nieuwsbrief, community, events, veel klanten tegelijk.

Niche, kies exact een: Marketingbureau, SEO Agency, Overig.

Verzin nooit jaartallen of klantaantallen. Antwoord UITSLUITEND met JSON:
{"score": number, "onderbouwing": string, "niche": string, "compliment": string, "websitesInAanbod": boolean, "skip": boolean, "skipReden": string}
- onderbouwing: 3 tot 5 regels met concrete observaties (klantlogo's, jaartal, cases, wat je in hun diensten zag).
- skip: true bij een diskwalificatie of score < 6.
Alles in het Nederlands.`;

  const content: any[] = [
    {
      type: 'text',
      text: `Partnergegevens:\n${JSON.stringify(lead, null, 2)}\n\nWebsite-tekst (afgekapt):\n${
        siteTekst.slice(0, 7000) || '(geen website-inhoud opgehaald)'
      }`,
    },
  ];
  if (screenshotUrl) {
    content.push({ type: 'text', text: 'Screenshot van de homepage, ter info:' });
    content.push({ type: 'image', source: { type: 'url', url: screenshotUrl } });
  }

  try {
    const out = await ask(system, content, 1200);
    const j = JSON.parse(out);
    const score = Number(j.score) || 0;
    const niche = (['Marketingbureau', 'SEO Agency', 'Overig'] as string[]).includes(j.niche) ? j.niche : 'Overig';
    return {
      score,
      onderbouwing: j.onderbouwing || '',
      niche,
      skip: Boolean(j.skip) || Boolean(j.websitesInAanbod) || score < 6,
      skipReden: j.websitesInAanbod ? 'biedt zelf websites aan' : j.skipReden || (score < 6 ? 'score onder 6' : undefined),
      compliment: j.compliment || '',
    };
  } catch {
    return { score: 0, onderbouwing: 'Kwalificatie mislukt.', niche: 'Overig', skip: true, skipReden: 'parse-fout' };
  }
}
