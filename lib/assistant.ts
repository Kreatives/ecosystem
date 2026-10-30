import Anthropic from '@anthropic-ai/sdk';
import { env, type DbType } from './env';
import { MODEL } from './anthropic';
import { listLeads, verwijderLead as notionVerwijder } from './notion';
import { moveToColumn, toggleCheckbox } from './actions';
import { supabase } from './supabase';
import { columnsFor, funnelFor } from './notion-schema';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Actie = { tool: string; resultaat: string };

function client(): Anthropic {
  if (!env.anthropic) throw new Error('ANTHROPIC_API_KEY ontbreekt.');
  return new Anthropic({ apiKey: env.anthropic });
}

const TOOLS: any[] = [
  {
    name: 'zoek_leads',
    description: 'Zoek leads op (deel van) naam. Geef de gevonden leads met hun id terug, zodat je daarna een actie kunt doen.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'deel van de bedrijfsnaam' },
        type: { type: 'string', enum: ['client', 'partner'], description: 'optioneel: klant of partner' },
      },
      required: ['query'],
    },
  },
  {
    name: 'verwijder_lead',
    description: 'Verwijder (archiveer) een lead in Notion. Vraag eerst om bevestiging als de gebruiker niet duidelijk één specifieke lead bedoelde.',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['client', 'partner'] } }, required: ['id', 'type'] },
  },
  {
    name: 'verplaats_lead',
    description: 'Verplaats een lead naar een Kanban-kolom (zet de bijbehorende checkboxes in Notion).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, type: { type: 'string', enum: ['client', 'partner'] }, kolom: { type: 'string' } },
      required: ['id', 'type', 'kolom'],
    },
  },
  {
    name: 'zet_checkbox',
    description: 'Vink een funnel-checkbox aan of uit (Sent, Opened, Replied, Gesprek, Booked, Closed).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, type: { type: 'string', enum: ['client', 'partner'] }, key: { type: 'string' }, value: { type: 'boolean' } },
      required: ['id', 'type', 'key', 'value'],
    },
  },
  {
    name: 'statistieken',
    description: 'Geef de funnel-totalen (hoeveel leads Sent/Opened/Replied/etc.) voor klant of partner.',
    input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['client', 'partner'] } }, required: ['type'] },
  },
];

async function zoekLeads(query: string, type?: DbType): Promise<any[]> {
  const q = query.trim().toLowerCase();
  const sb = supabase();
  if (sb) {
    let req = sb.from('lead_mirror').select('page_id,naam,type,column,status,score').ilike('naam', `%${query}%`).limit(10);
    if (type) req = req.eq('type', type);
    const { data } = await req;
    if (data) return data.map((r: any) => ({ id: r.page_id, naam: r.naam, type: r.type, kolom: r.column, status: r.status, score: r.score }));
  }
  // fallback: direct uit Notion
  const types: DbType[] = type ? [type] : ['client', 'partner'];
  const out: any[] = [];
  for (const t of types) {
    const leads = await listLeads(t);
    for (const l of leads) if (l.naam.toLowerCase().includes(q)) out.push({ id: l.id, naam: l.naam, type: t, kolom: l.column, status: l.status, score: l.score });
  }
  return out.slice(0, 10);
}

async function statistieken(type: DbType): Promise<any> {
  const sb = supabase();
  const funnel = funnelFor(type);
  if (!sb) return { fout: 'geen database' };
  const { data } = await sb.from('lead_mirror').select('checks').eq('type', type);
  const totaal: Record<string, number> = { totaal: (data || []).length };
  for (const f of funnel) totaal[f] = 0;
  for (const r of data || []) for (const f of funnel) if ((r.checks || {})[f]) totaal[f]++;
  return totaal;
}

async function runTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'zoek_leads': {
      const leads = await zoekLeads(input.query, input.type);
      return leads.length ? JSON.stringify(leads) : 'geen leads gevonden';
    }
    case 'verwijder_lead':
      await notionVerwijder(input.id);
      supabase()?.from('lead_mirror').delete().eq('page_id', input.id).then(() => {}, () => {});
      return 'verwijderd (gearchiveerd in Notion)';
    case 'verplaats_lead':
      await moveToColumn(input.type, input.id, input.kolom);
      return `verplaatst naar ${input.kolom}`;
    case 'zet_checkbox':
      await toggleCheckbox(input.type, input.id, input.key, input.value);
      return `${input.key} = ${input.value}`;
    case 'statistieken':
      return JSON.stringify(await statistieken(input.type));
    default:
      return `onbekende tool ${name}`;
  }
}

const SYSTEM = `Je bent de ingebouwde assistent van de KREATIVES Outreach-app. Je helpt Ricky met zijn leads en kunt echte wijzigingen doen via tools: leads zoeken, verwijderen (archiveren in Notion), verplaatsen tussen Kanban-kolommen, funnel-checkboxes zetten, en statistieken opvragen.

Regels:
- Je verstuurt NOOIT outreach-berichten, connectieverzoeken of e-mails. Dat doet Ricky zelf. Je hebt daar ook geen tool voor.
- Notion is leidend; al je wijzigingen gaan via Notion.
- Zoek eerst de lead op (zoek_leads) om het id te krijgen voordat je een actie doet.
- Bij verwijderen: als meerdere leads matchen of het onduidelijk is, vraag eerst welke. Bij één duidelijke match mag je het direct doen en kort bevestigen.
- Kolommen: ${columnsFor('client').join(', ')} (partners zonder Gesprek).
- Antwoord kort en in het Nederlands. Noem na een actie wat je gedaan hebt.`;

/** Draait de assistent met tool-use tot een eindantwoord. Geeft de reply + de
 *  uitgevoerde acties terug. */
export async function runAssistant(history: ChatMessage[]): Promise<{ reply: string; acties: Actie[] }> {
  const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));
  const acties: Actie[] = [];

  for (let stap = 0; stap < 6; stap++) {
    const res = await client().messages.create({ model: MODEL, max_tokens: 1200, system: SYSTEM, tools: TOOLS, messages });
    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content });
      const results: any[] = [];
      for (const block of res.content as any[]) {
        if (block.type === 'tool_use') {
          let resultaat: string;
          try {
            resultaat = await runTool(block.name, block.input);
          } catch (e: any) {
            resultaat = `fout: ${e?.message || e}`;
          }
          acties.push({ tool: block.name, resultaat });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: resultaat });
        }
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    const reply = (res.content as any[]).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    return { reply: reply || 'Klaar.', acties };
  }
  return { reply: 'Ik heb te veel stappen nodig; probeer het concreter.', acties };
}
