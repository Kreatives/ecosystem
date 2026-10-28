/**
 * De follow-up-regels. Pure functies: ze berekenen welke Notion-properties moeten
 * veranderen bij een actie ("Day 2 verstuurd", "Replied aangevinkt", ...). De app
 * schrijft daarna die patch naar Notion. Geen enkele actie verstuurt een bericht.
 *
 * Belangrijk over Date: de app zet Date alleen op het moment van een actie. Hij
 * herschrijft Date nooit tijdens een sync, zodat een datum die Ricky zelf aanpast
 * altijd blijft staan.
 *
 * Regels komen 1-op-1 uit de bouwopdracht. Waar de opdracht ruimte liet, staat de
 * interpretatie in een comment zodat Ricky het kan nalezen.
 */
import type { DbType } from './env';
import type { StatusValue } from './notion-schema';

export type FollowupAction =
  | 'day1-sent'
  | 'day2-sent'
  | 'replied'
  | 'day3-reply-sent'
  | 'day4-sent'
  | 'day3-noreply-sent'
  | 'noreply-sent' // partner
  | 'noreply-final'
  | 'afgerond';

export type FollowupPatch = {
  status?: StatusValue;
  date?: string | null; // null = Date leegmaken
  checks?: Record<string, boolean>;
  f?: Partial<{ f1: boolean; f2: boolean; f3: boolean }>;
  /** Welk bericht hierna getoond moet worden (voor het dagoverzicht, fase 6). */
  showMessage?: string;
  note: string;
};

function addDays(today: string, days: number): string {
  // today = YYYY-MM-DD, lokale datum-rekenkunde zonder tijdzone-drift.
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function applyFollowup(
  type: DbType,
  action: FollowupAction,
  ctx: { today: string; status: StatusValue | null },
): FollowupPatch {
  const t = ctx.today;

  // Gemeenschappelijk: afronden bij een gesprek/booking/close.
  if (action === 'afgerond') {
    return { status: 'Afgerond', date: null, note: 'Gesprek/Booked/Closed → afgerond, geen follow-up meer.' };
  }

  if (type === 'client') {
    switch (action) {
      case 'day1-sent':
        return {
          status: 'Day 1',
          date: addDays(t, 1),
          checks: { Sent: true },
          note: 'Day 1 (bedankje) verstuurd → Sent ✓, morgen Day 2.',
          showMessage: 'day2',
        };
      case 'day2-sent':
        return {
          status: 'Day 2',
          date: addDays(t, 3),
          note: 'Day 2 (hoofdbericht) verstuurd → over 3 dagen opvolgen.',
        };
      case 'replied':
        // Replied aangevinkt terwijl Status = Day 2: meteen Day 3 (bij reactie) tonen.
        if (ctx.status === 'Day 2') {
          return {
            date: t,
            checks: { Replied: true },
            showMessage: 'day3-reply',
            note: 'Replied tijdens Day 2 → Day 3 (bij reactie) tonen, datum = vandaag.',
          };
        }
        return { checks: { Replied: true }, note: 'Replied aangevinkt.' };
      case 'day3-reply-sent':
        return {
          status: 'Day 3',
          date: addDays(t, 2),
          showMessage: 'day4',
          note: 'Day 3 (video, bij reactie) verstuurd → over 2 dagen Day 4.',
        };
      case 'day4-sent':
        // Bouwopdracht: F2 ✓ bij Day 4 in de reactie-tak.
        return {
          status: 'Day 4',
          date: addDays(t, 4),
          f: { f2: true },
          note: 'Day 4 (call-voorstel) verstuurd → F2 ✓, over 4 dagen opvolgen.',
        };
      case 'day3-noreply-sent':
        return {
          status: 'Day 3',
          date: addDays(t, 10),
          f: { f1: true },
          note: 'Day 3 (geen reactie) verstuurd → F1 ✓, over 10 dagen nog een poging.',
        };
      case 'noreply-final':
        return {
          status: 'Geen reactie',
          date: null,
          f: { f2: true },
          note: 'Nog steeds geen reactie → F2 ✓, Status Geen reactie, uit het dagoverzicht.',
        };
    }
  }

  if (type === 'partner') {
    switch (action) {
      case 'day1-sent':
        return {
          status: 'Day 1',
          date: addDays(t, 1),
          checks: { Sent: true },
          note: 'Partner Day 1 (connectie) verstuurd → Sent ✓, morgen Day 2.',
          showMessage: 'day2',
        };
      case 'day2-sent':
        return {
          status: 'Day 2',
          date: addDays(t, 3),
          note: 'Partner Day 2 (voorstel) verstuurd → over 3 dagen opvolgen.',
        };
      case 'noreply-sent':
        return {
          date: addDays(t, 10),
          f: { f1: true },
          note: 'Partner geen-reactie-bericht verstuurd → F1 ✓, over 10 dagen afronden.',
        };
      case 'noreply-final':
        return {
          status: 'Geen reactie',
          date: null,
          note: 'Partner nog steeds niets → Status Geen reactie, uit het dagoverzicht.',
        };
    }
  }

  return { note: `Onbekende actie "${action}" voor ${type}.` };
}
