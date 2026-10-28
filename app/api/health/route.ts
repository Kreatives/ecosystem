import { NextResponse, connection } from 'next/server';
import { env, hasSupabase } from '@/lib/env';

/** GET /api/health — welke koppelingen staan er? Geen sleutels, alleen status. */
export async function GET() {
  await connection(); // runtime, niet prerenderen — leest de echte env op Vercel
  return NextResponse.json({
    notion: Boolean(env.notionToken && env.clientsDb && env.partnersDb),
    clientsDb: Boolean(env.clientsDb),
    partnersDb: Boolean(env.partnersDb),
    supabase: hasSupabase(),
    anthropic: Boolean(env.anthropic),
    apify: Boolean(env.apify),
    deepApi: Boolean(env.deepApi),
  });
}
