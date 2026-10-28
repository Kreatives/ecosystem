import { notion, listLeads } from './notion';
import { dbIdFor, type DbType } from './env';
import { propsFor } from './notion-schema';
import type { RawLead } from './apify';
import type { QualifyResult } from './qualify';

const normDomein = (website: string) =>
  (website || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();

const normUrl = (u: string) => (u || '').replace(/\/+$/, '').toLowerCase();

/**
 * Bouwt een dedupe-checker tegen de bestaande Notion-leads (één keer ophalen).
 * Matcht op domein, leadnaam of outreach-URL, zodat je niemand dubbel benadert.
 */
export async function maakDedupeChecker(type: DbType) {
  const bestaand = await listLeads(type);
  const domeinen = new Set<string>();
  const namen = new Set<string>();
  const outreach = new Set<string>();
  for (const l of bestaand) {
    const d = normDomein(l.website);
    if (d) domeinen.add(d);
    if (l.naam) namen.add(l.naam.trim().toLowerCase());
    if (l.outreach) outreach.add(normUrl(l.outreach));
  }
  return (raw: RawLead) => {
    const d = normDomein(raw.website);
    const naam = (raw.naam || '').trim().toLowerCase();
    const o = normUrl(raw.linkedin || raw.instagram || '');
    return (!!d && domeinen.has(d)) || (!!naam && namen.has(naam)) || (!!o && outreach.has(o));
  };
}

function outreachVoor(raw: RawLead): { url: string; platform: string } {
  if (raw.linkedin) return { url: raw.linkedin, platform: 'LinkedIn' };
  if (raw.instagram) return { url: raw.instagram, platform: 'Instagram' };
  return { url: '', platform: 'Google' };
}

/** Schrijft een gekwalificeerde lead naar de juiste Notion-database. */
export async function schrijfLead(type: DbType, raw: RawLead, q: QualifyResult): Promise<string> {
  const P = propsFor(type);
  const { url: outreach, platform } = outreachVoor(raw);

  const props: Record<string, any> = {
    [P.title]: { title: [{ text: { content: (raw.naam || 'Onbekend').slice(0, 190) } }] },
    [P.niche]: { select: { name: q.niche || 'Overig' } },
    [P.score]: { number: Number(q.score) || 0 },
    [P.status]: { select: { name: 'Nog niet gestart' } },
  };
  if (raw.website) props[P.website] = { url: raw.website };
  if (outreach) props[P.outreach] = { url: outreach };
  if (platform) {
    props[P.platform] = P.platformType === 'multi_select' ? { multi_select: [{ name: platform }] } : { select: { name: platform } };
  }

  const regels = [
    `Score: ${q.score} / 10`,
    '',
    'Onderbouwing',
    q.onderbouwing || '(geen)',
  ];
  if (q.compliment) {
    regels.push('', 'Compliment', q.compliment);
  }
  if (q.pijnpunten?.length) {
    regels.push('', 'Pijnpunten (basis-analyse)', ...q.pijnpunten.map((p, i) => `${i + 1}. ${p}`));
  }
  if (raw.contactpersoon) {
    regels.push('', 'Contactpersoon', `${raw.contactpersoon}${raw.rol ? ` — ${raw.rol}` : ''}`);
  }
  const body = regels.join('\n');

  const page: any = await notion().pages.create({
    parent: { database_id: dbIdFor(type) },
    properties: props,
    children: body.split('\n\n').map((blok) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: blok.slice(0, 1900) } }] },
    })),
  });
  return page.id as string;
}
