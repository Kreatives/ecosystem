import { env } from './env';

/**
 * Maakt full-page screenshots (desktop 1440px + mobiel 390px) met Playwright en
 * uploadt ze naar Supabase Storage (bucket "screenshots"). Geeft publieke URL's
 * terug om in Notion in te sluiten. Best-effort: faalt dit, dan lege URL's en de
 * run gaat door. Playwright wordt dynamisch geladen zodat de build 'm niet bundelt.
 * (Op Vercel later via @sparticuz/chromium + playwright-core.)
 */
export async function maakScreenshots(
  url: string,
  slug: string,
): Promise<{ desktop: string; mobiel: string }> {
  const leeg = { desktop: '', mobiel: '' };
  if (!url || !env.supabaseUrl || !env.supabaseKey) return leeg;

  let browser: any;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    const out: { desktop: string; mobiel: string } = { desktop: '', mobiel: '' };
    const varianten: ['desktop' | 'mobiel', { width: number; height: number }][] = [
      ['desktop', { width: 1440, height: 900 }],
      ['mobiel', { width: 390, height: 844 }],
    ];
    for (const [naam, viewport] of varianten) {
      try {
        const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(800);
        const buf: Buffer = await page.screenshot({ fullPage: true });
        const safe = slug.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
        const path = `${safe}-${naam}.png`;
        const url2 = await upload(path, buf);
        if (url2) out[naam] = url2;
        await page.close();
      } catch {
        /* één variant mislukt: door */
      }
    }
    return out;
  } catch {
    return leeg;
  } finally {
    try {
      await browser?.close();
    } catch {
      /* al dicht */
    }
  }
}

async function upload(path: string, buf: Buffer): Promise<string> {
  try {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/screenshots/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.supabaseKey}`,
        apikey: env.supabaseKey,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) return '';
    return `${env.supabaseUrl}/storage/v1/object/public/screenshots/${path}`;
  } catch {
    return '';
  }
}
