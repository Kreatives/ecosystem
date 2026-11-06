/**
 * Draait één scrape-run vanaf de command line (geen Vercel-tijdslimiet).
 * Draaien: set -a; source .env.local; set +a; npx tsx scripts/run-scrape.ts "<brief>" <aantal> <client|partner> <linkedin|instagram|beide>
 */
import { createJob, subscribe } from '../lib/jobs';
import { runPipeline, type RunInput } from '../lib/run-pipeline';

async function main() {
  const brief = process.argv[2] || '';
  const aantal = Number(process.argv[3]) || 10;
  const type = (process.argv[4] === 'partner' ? 'partner' : 'client') as RunInput['type'];
  const platform = (['linkedin', 'instagram', 'beide'].includes(process.argv[5]) ? process.argv[5] : 'beide') as RunInput['platform'];
  if (!brief) { console.log('Geef een brief mee.'); return; }

  const job = createJob('scrape', { brief, type, platform });
  console.log(`Run: ${type} · ${platform} · ${aantal} leads · jobId ${job.id}\n`);
  subscribe(job, (e) => {
    if (e.kind === 'log') console.log('  ', e.msg);
    else if (e.kind === 'step' && e.state === 'done') console.log(`[${e.key}] ${e.counter || ''}`);
    else if (e.kind === 'leaderror') console.log(`  [!] ${e.naam} — ${e.reden}`);
    else if (e.kind === 'done') console.log('\n[DONE]', JSON.stringify(e.summary));
    else if (e.kind === 'error') console.log('[ERROR]', e.msg);
  });
  await runPipeline(job, { brief, aantal, type, platform });
}

main().catch((e) => { console.error('Mislukt:', e.message); process.exit(1); });
