import { notion, listLeads } from './notion';
import { dbIdFor, type DbType } from './env';
import { propsFor } from './notion-schema';
import type { RawLead } from './apify';
import type { QualifyResult } from './qualify';
import type { Berichten } from './writer';
import { h2, h3, para, bullet, divider, callout, image } from './notion-blocks';

const normDomein = (website: string) =>
  (website || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
const normUrl = (u: string) => (u || '').replace(/\/+$/, '').toLowerCase();

/** Dedupe-checker tegen bestaande Notion-leads (één keer ophalen). */
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

function outreachVoor(raw: RawLead, voorkeur: 'linkedin' | 'instagram' | 'beide'): { url: string; platform: string } {
  const li = { url: raw.linkedin || '', platform: 'LinkedIn' };
  const ig = { url: raw.instagram || '', platform: 'Instagram' };
  const volgorde = voorkeur === 'instagram' ? [ig, li] : [li, ig];
  for (const o of volgorde) if (o.url) return o;
  return { url: '', platform: 'Google' };
}

/** Splitst de klant-onderbouwing (PROFIELFIT/KOOPSIGNALEN/WEBSITE-ZWAKTE) in bullets. */
function onderbouwingBlocks(s: string): any[] {
  if (!s) return [para('(geen onderbouwing)')];
  const parts = s
    .split(/(?=PROFIELFIT|KOOPSIGNALEN|WEBSITE[- ]?ZWAKTE)/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((p) => !/^onderbouwing[:：]?$/i.test(p)); // losse label-restjes weg
  if (parts.length <= 1) return [para(s)];
  return parts.map((p) => {
    const idx = p.indexOf(':');
    if (idx > 0) {
      const label = p.slice(0, idx).trim();
      const mooi = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
      return bullet(`**${mooi}:** ${p.slice(idx + 1).trim()}`);
    }
    return bullet(p);
  });
}

/** Bouwt de leesbare pagina-blokken voor een lead (score, onderbouwing, berichten,
 *  pijnpunten). Los van het schrijven zodat we bestaande pagina's kunnen herformatteren. */
export function leadBlocks(type: DbType, raw: RawLead, q: QualifyResult, berichten?: Berichten): any[] {
  const children: any[] = [];

  // 1) Score & onderbouwing
  children.push(h2(`Score ${q.score} / 10`));
  children.push(...(type === 'client' ? onderbouwingBlocks(q.onderbouwing) : [para(q.onderbouwing || '(geen onderbouwing)')]));
  if (q.compliment) {
    children.push(h3('Compliment'));
    children.push(para(q.compliment));
  }

  // 2) Berichten (per dag, per variant) — kopieerklaar
  if (berichten?.items.length) {
    children.push(divider());
    children.push(h2(`Berichten · ${berichten.kanaal}`));
    children.push(para('Placeholders als {link}, {dag} en {concurrent} vul je zelf in. {concurrent} komt uit de concurrentie-analyse (fase 2).'));
    for (const b of berichten.items) {
      children.push(h3(b.label));
      children.push(callout(b.tekst));
    }
  }

  // 3) Loom-bullets
  if (q.loomBullets?.length) {
    children.push(divider());
    children.push(h2('Loom-bullets (±3 min)'));
    for (const b of q.loomBullets) children.push(bullet(b));
  }

  // 4) Concurrenten
  if (q.concurrenten?.length) {
    children.push(divider());
    children.push(h2('Concurrenten'));
    for (const c of q.concurrenten) {
      children.push(h3(`${c.bestFit ? '★ ' : ''}${c.naam} · ${c.land}`));
      if (c.url) children.push(para(c.url));
      if (c.beter) children.push(bullet(`**Beter:** ${c.beter}`));
      if (c.zwakker) children.push(bullet(`**Zwakker:** ${c.zwakker}`));
      if (c.aanvalszin) children.push(bullet(`**Aanvalszin:** ${c.aanvalszin}`));
    }
  }

  // 5) Pijnpunten (volledig)
  if (q.pijnpunten?.length) {
    children.push(divider());
    children.push(h2('Pijnpunten'));
    for (const p of q.pijnpunten) children.push(bullet(p));
  }

  // 6) Screenshots
  if (q.screenshotDesktop || q.screenshotMobiel) {
    children.push(divider());
    children.push(h2('Screenshots'));
    if (q.screenshotDesktop) {
      children.push(h3('Desktop'));
      children.push(image(q.screenshotDesktop));
    }
    if (q.screenshotMobiel) {
      children.push(h3('Mobiel'));
      children.push(image(q.screenshotMobiel));
    }
  }

  if (raw.contactpersoon) {
    children.push(divider());
    children.push(h3('Contactpersoon'));
    children.push(para(`${raw.contactpersoon}${raw.rol ? ` — ${raw.rol}` : ''}`));
  }

  return children.slice(0, 100); // Notion: max 100 blokken per create
}

/** Schrijft een gekwalificeerde lead naar Notion met nette, leesbare blokken. */
export async function schrijfLead(
  type: DbType,
  raw: RawLead,
  q: QualifyResult,
  platformVoorkeur: 'linkedin' | 'instagram' | 'beide' = 'beide',
  berichten?: Berichten,
): Promise<string> {
  const P = propsFor(type);
  const { url: outreach, platform } = outreachVoor(raw, platformVoorkeur);

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

  const page: any = await notion().pages.create({
    parent: { database_id: dbIdFor(type) },
    properties: props,
    children: leadBlocks(type, raw, q, berichten),
  });
  return page.id as string;
}
