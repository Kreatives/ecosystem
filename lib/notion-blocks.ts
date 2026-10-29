/**
 * Kleine helpers om nette Notion-blokken te bouwen (koppen, bullets, bold,
 * dividers, callouts) zodat de leadpagina leesbaar is in plaats van één tekstdump.
 * Ondersteunt **bold** in strings.
 */

type RichText = any;

/** Zet een string met **bold**-markeringen om naar Notion rich_text. */
export function rt(text: string): RichText[] {
  const parts: RichText[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', text: { content: text.slice(last, m.index) } });
    parts.push({ type: 'text', text: { content: m[1] }, annotations: { bold: true } });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: { content: text.slice(last) } });
  // Notion limiteert een text-segment op 2000 tekens.
  return parts.map((p) => ({ ...p, text: { ...p.text, content: (p.text.content || '').slice(0, 1990) } }));
}

export const h2 = (text: string) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(text) } });
export const h3 = (text: string) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: rt(text) } });
export const para = (text: string) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: text ? rt(text) : [] } });
export const bullet = (text: string) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(text) } });
export const divider = () => ({ object: 'block', type: 'divider', divider: {} });

/** Een bericht als callout-kaart (makkelijk te kopiëren, visueel een blok). */
export const callout = (text: string, emoji = '💬') => ({
  object: 'block',
  type: 'callout',
  callout: { icon: { type: 'emoji', emoji }, rich_text: rt(text) },
});

export const image = (url: string) => ({ object: 'block', type: 'image', image: { type: 'external', external: { url } } });
