/**
 * Bepaalt per lead wat de volgende stap is: welk bericht nu klaarstaat, welke
 * actie-knop daarbij hoort, en waarom het nu aan de beurt is. Puur afgeleid van
 * Status + de checkboxes; stuurt nooit iets.
 */
import type { DbType } from './env';
import type { FollowupAction } from './followup';
import type { StatusValue } from './notion-schema';

export type NextStep = {
  berichtLabel: string | null; // kop in de Notion-pagina om het bericht op te halen (null = geen bericht, alleen actie)
  action: FollowupAction;
  actionLabel: string;
  waarom: string;
};

export function nextStep(
  type: DbType,
  status: StatusValue | null,
  checks: Record<string, boolean>,
  f: { f1: boolean; f2: boolean; f3: boolean },
): NextStep | null {
  if (status === 'Geen reactie' || status === 'Afgerond') return null;
  const replied = !!checks.Replied;
  const s = status || 'Nog niet gestart';

  if (type === 'partner') {
    switch (s) {
      case 'Nog niet gestart':
        return { berichtLabel: 'Day 1 — Connectieverzoek', action: 'day1-sent', actionLabel: 'Day 1 verstuurd', waarom: 'Nieuwe partner — stuur de connectie.' };
      case 'Day 1':
        return { berichtLabel: 'Day 2 — Voorstel', action: 'day2-sent', actionLabel: 'Day 2 verstuurd', waarom: 'Stuur het voorstel (15%/25%).' };
      case 'Day 2':
        return f.f1
          ? { berichtLabel: null, action: 'noreply-final', actionLabel: 'Afsluiten (geen reactie)', waarom: 'Nog steeds niets gehoord.' }
          : { berichtLabel: 'Geen reactie (na Day 2)', action: 'noreply-sent', actionLabel: 'Geen-reactie verstuurd', waarom: 'Geen reactie — stuur wat ze kunnen verwachten.' };
      default:
        return { berichtLabel: null, action: 'noreply-final', actionLabel: 'Afsluiten (geen reactie)', waarom: 'Opvolging afronden.' };
    }
  }

  // KLANT
  switch (s) {
    case 'Nog niet gestart':
      return { berichtLabel: 'Day 1 — Na connectie', action: 'day1-sent', actionLabel: 'Day 1 verstuurd', waarom: 'Nieuwe lead — stuur het bedankje na de connectie.' };
    case 'Day 1':
      return { berichtLabel: 'Day 2 — variant 1', action: 'day2-sent', actionLabel: 'Day 2 verstuurd', waarom: 'Dag na de connectie — stuur het hoofdbericht (5 varianten in de pagina).' };
    case 'Day 2':
      return replied
        ? { berichtLabel: 'Day 3 — bij reactie', action: 'day3-reply-sent', actionLabel: 'Day 3 verstuurd', waarom: 'Heeft gereageerd — stuur de video.' }
        : { berichtLabel: 'Day 3 — geen reactie', action: 'day3-noreply-sent', actionLabel: 'Day 3 verstuurd', waarom: 'Geen reactie — stuur de tweede observatie.' };
    case 'Day 3':
      return replied
        ? { berichtLabel: 'Day 4 — Call-voorstel', action: 'day4-sent', actionLabel: 'Day 4 verstuurd', waarom: 'Stuur het call-voorstel met twee dagopties.' }
        : { berichtLabel: null, action: 'noreply-final', actionLabel: 'Afsluiten (geen reactie)', waarom: 'Nog steeds geen reactie.' };
    case 'Day 4':
      return { berichtLabel: null, action: 'noreply-final', actionLabel: 'Afsluiten (geen reactie)', waarom: 'Wachten op reactie, of afsluiten.' };
    default:
      return null;
  }
}
