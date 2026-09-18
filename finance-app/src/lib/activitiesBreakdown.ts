// Pure computation behind the Statement of Activities' Event-Related vs
// General & Administrative expense split (Phase 5 of the posting-engine
// build plan). Kept framework-free, like journalEngine.ts, so it can be
// tested directly instead of only through a rendered component.
import { Account, JournalEntry } from '../types';

export interface ActivitiesExpenseBreakdown {
  generalAdminByAccount: Record<string, number>;
  generalAdminTotal: number;
  // eventName -> accountCode -> amount
  eventGroups: Record<string, Record<string, number>>;
  eventNames: string[];
  eventRelatedTotal: number;
}

/**
 * Splits every Expenses-type line across the given entries into General &
 * Administrative (no eventName on the entry) or Event-Related (grouped by
 * the entry's eventName). Only Expenses-type accounts are considered,
 * matching how the working paper itself only ever tags expense rows
 * Event-Related, never asset or revenue postings.
 */
export function computeActivitiesExpenseBreakdown(
  entries: JournalEntry[],
  accounts: Account[]
): ActivitiesExpenseBreakdown {
  const generalAdminByAccount: Record<string, number> = {};
  const eventGroups: Record<string, Record<string, number>> = {};

  entries.forEach(je => {
    je.lines.forEach(line => {
      const acc = accounts.find(a => a.code === line.accountCode);
      if (!acc || acc.type !== 'Expenses') return;

      const amount = line.debit - line.credit;
      if (je.eventName) {
        if (!eventGroups[je.eventName]) eventGroups[je.eventName] = {};
        eventGroups[je.eventName][acc.code] = (eventGroups[je.eventName][acc.code] || 0) + amount;
      } else {
        generalAdminByAccount[acc.code] = (generalAdminByAccount[acc.code] || 0) + amount;
      }
    });
  });

  const sum = (byAccount: Record<string, number>) => Object.values(byAccount).reduce((s, v) => s + v, 0);
  const generalAdminTotal = sum(generalAdminByAccount);
  const eventNames = Object.keys(eventGroups).sort();
  const eventRelatedTotal = eventNames.reduce((s, name) => s + sum(eventGroups[name]), 0);

  return { generalAdminByAccount, generalAdminTotal, eventGroups, eventNames, eventRelatedTotal };
}
