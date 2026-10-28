/**
 * De EXACTE property-namen zoals ze live in Notion staan. Bewust geen nieuwe
 * properties aanmaken; we gebruiken wat er is. De twee databases wijken op een
 * paar punten af (zie opmerkingen), dus de namen staan per type apart.
 *
 * Clients:  Score heet "Score (0-10)", Outreach heet "Outreach link",
 *           Platform = single-select, heeft Gesprek + EXTRA.
 * Partners: Score heet "Score", Outreach heet "Outreach link",
 *           Platform = multi-select, GEEN Gesprek, GEEN EXTRA.
 *           Date + sequence-Status zijn via de migratie toegevoegd.
 */
import type { DbType } from './env';

export const STATUS_OPTIONS = [
  'Nog niet gestart',
  'Day 1',
  'Day 2',
  'Day 3',
  'Day 4',
  'Geen reactie',
  'Afgerond',
] as const;
export type StatusValue = (typeof STATUS_OPTIONS)[number];

/** Alle funnel-checkboxes die bestaan, in volgorde laag → hoog. */
export const CLIENT_FUNNEL = ['Sent', 'Opened', 'Replied', 'Gesprek', 'Booked', 'Closed'] as const;
export const PARTNER_FUNNEL = ['Sent', 'Opened', 'Replied', 'Booked', 'Closed'] as const;

export type FunnelKey = (typeof CLIENT_FUNNEL)[number];

export function funnelFor(type: DbType): readonly FunnelKey[] {
  return type === 'partner' ? PARTNER_FUNNEL : CLIENT_FUNNEL;
}

/** De kolommen van het Kanban-bord: "Nog niet gestart" plus de funnel. */
export function columnsFor(type: DbType): readonly string[] {
  return ['Nog niet gestart', ...funnelFor(type)];
}

type PropMap = {
  title: string;
  website: string;
  niche: string;
  outreach: string;
  platform: string;
  platformType: 'select' | 'multi_select';
  score: string;
  status: string;
  date: string;
  extra?: string;
  // follow-up checkboxes
  f1: string;
  f2: string;
  f3: string;
};

const CLIENT_PROPS: PropMap = {
  title: 'Lead',
  website: 'Website',
  niche: 'Niche',
  outreach: 'Outreach link',
  platform: 'Platform',
  platformType: 'select',
  score: 'Score (0-10)',
  status: 'Status',
  date: 'Date',
  extra: 'EXTRA',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
};

const PARTNER_PROPS: PropMap = {
  title: 'Lead',
  website: 'Website',
  niche: 'Niche',
  outreach: 'Outreach link',
  platform: 'Platform',
  platformType: 'multi_select',
  score: 'Score',
  status: 'Status',
  date: 'Date',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
};

export function propsFor(type: DbType): PropMap {
  return type === 'partner' ? PARTNER_PROPS : CLIENT_PROPS;
}
