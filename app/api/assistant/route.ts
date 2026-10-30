import { NextResponse } from 'next/server';
import { runAssistant, type ChatMessage } from '@/lib/assistant';

export const maxDuration = 60;

/** POST /api/assistant { messages: ChatMessage[] } → { reply, acties } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) return NextResponse.json({ error: 'geen bericht' }, { status: 400 });
  try {
    const out = await runAssistant(messages);
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
