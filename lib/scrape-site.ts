import type { RawLead } from './apify';

/** Haalt de homepage-tekst op zonder browser. Genoeg voor de meeste sites. */
export async function haalSite(url: string): Promise<{ tekst: string; linkedin: string; ok: boolean }> {
  const leeg = { tekst: '', linkedin: '', ok: false };
  if (!url) return leeg;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return leeg;
    const html = await res.text();
    const linkedin = (html.match(/https?:\/\/[a-z]{0,3}\.?linkedin\.com\/(in|company)\/[A-Za-z0-9\-_%]+/i) || [''])[0];
    const tekst = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { tekst, linkedin, ok: true };
  } catch {
    return leeg;
  }
}

/** Harde filters per bron. Scheelt API-kosten: hier valt het grootste deel af. */
export function haalDoorFilter(
  lead: RawLead,
  opts: { minVolgers?: number; minReviews?: number } = {},
): { door: boolean; redenen: string[] } {
  const redenen: string[] = [];

  if (lead.bron === 'google-maps') {
    const minReviews = opts.minReviews ?? 10;
    if (!lead.website) redenen.push('geen eigen website');
    if (/facebook\.com|instagram\.com|linktr\.ee/i.test(lead.website || '')) redenen.push('socialprofiel als website');
    if ((lead.reviewAantal ?? 0) < minReviews) redenen.push(`minder dan ${minReviews} reviews`);
  } else if (lead.bron === 'instagram') {
    const minVolgers = opts.minVolgers ?? 1000;
    if ((lead.volgers ?? 0) < minVolgers) redenen.push(`minder dan ${minVolgers} volgers`);
  } else if (lead.bron === 'linkedin') {
    if (!lead.linkedin) redenen.push('geen LinkedIn-profiel');
  }

  const ketens = /dental clinics|ivoren kruis|basic fit|specsavers|the travel club/i;
  if (ketens.test(lead.naam || '')) redenen.push('keten of franchise');

  return { door: redenen.length === 0, redenen };
}
