import type { DbType } from './env';
import type { StatusValue } from './notion-schema';

/** Eén lead zoals de app hem toont. Afgeleid van de Notion-pagina. */
export type Lead = {
  id: string; // Notion page-id
  type: DbType;
  naam: string;
  website: string;
  outreach: string;
  niche: string;
  platform: string;
  score: number | null;
  status: StatusValue | null;
  date: string | null; // YYYY-MM-DD
  checks: Record<string, boolean>; // funnel-checkbox → aangevinkt
  f: { f1: boolean; f2: boolean; f3: boolean };
  column: string; // afgeleide Kanban-kolom
  notionUrl: string;
  lastEdited: string; // ISO
};

export type Counts = { notion: number; shown: number; drift: number };
