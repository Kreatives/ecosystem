import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!env.anthropic) throw new Error('ANTHROPIC_API_KEY ontbreekt.');
  if (!_client) _client = new Anthropic({ apiKey: env.anthropic });
  return _client;
}

// Sonnet voor het bulk-werk (brief + kwalificeren). Goedkoop genoeg per lead.
export const MODEL = 'claude-sonnet-4-6';

/** Eén call naar Claude. Geeft platte tekst terug, met ```json-fences gestript. */
export async function ask(system: string, content: any[], maxTokens = 1500): Promise<string> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
  });
  const text = res.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n');
  return text.replace(/```json|```/g, '').trim();
}

/** Korte preflight: controleert of de Anthropic-sleutel werkt. Gooit een duidelijke
 *  fout zodat een run niet stilletjes op elke lead "parse-fout" oplevert. */
export async function ping(): Promise<void> {
  if (!env.anthropic) throw new Error('ANTHROPIC_API_KEY ontbreekt in .env.local.');
  try {
    await client().messages.create({ model: MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] });
  } catch (e: any) {
    if (e?.status === 401) throw new Error('Anthropic-sleutel ongeldig (401). Vul een geldige ANTHROPIC_API_KEY in.');
    throw new Error(`Anthropic niet bereikbaar: ${e?.message || e}`);
  }
}

/** Vraagt Claude om JSON en parset het; valt terug op een default bij mislukking. */
export async function askJson<T>(system: string, content: any[], fallback: T, maxTokens = 1500): Promise<T> {
  try {
    const out = await ask(system, content, maxTokens);
    return JSON.parse(out) as T;
  } catch {
    return fallback;
  }
}

/** Claude met ingebouwde web search. Geeft de samengevoegde tekst van de
 *  antwoord-blokken terug (de tool-resultaten zitten ertussen). */
export async function askWeb(system: string, userText: string, maxUses = 4, maxTokens = 2500): Promise<string> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }] as any,
    messages: [{ role: 'user', content: userText }],
  });
  return res.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();
}
