import type { DbType } from './env';
import { funnelFor, type FunnelKey } from './notion-schema';

/**
 * De kolom van een lead = de HOOGSTE aangevinkte checkbox. Geen enkele checkbox
 * aan betekent "Nog niet gestart". Dit is puur afgeleid van de checkboxes in
 * Notion, niet van de Status-select (die volgt de dag-in-de-sequence).
 */
export function columnFromChecks(type: DbType, checks: Record<string, boolean>): string {
  const funnel = funnelFor(type);
  let col = 'Nog niet gestart';
  for (const key of funnel) {
    if (checks[key]) col = key;
  }
  return col;
}

/**
 * De set checkboxes die hoort bij "de lead staat in kolom X". Alles tot en met de
 * kolom aan, alles erboven uit. Zo vinkt naar X slepen alles ervoor ook aan en
 * terugslepen alles erna uit.
 */
export function checksForColumn(type: DbType, column: string): Record<FunnelKey, boolean> {
  const funnel = funnelFor(type);
  const target = funnel.indexOf(column as FunnelKey); // -1 voor "Nog niet gestart"
  const out = {} as Record<FunnelKey, boolean>;
  funnel.forEach((key, i) => {
    out[key] = target >= 0 && i <= target;
  });
  return out;
}
