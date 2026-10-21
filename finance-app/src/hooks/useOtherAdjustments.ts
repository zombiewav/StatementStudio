import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { adjustmentSemesterKey, computeOtherAdjustments } from '../lib/otherAdjustments';
import { SemesterAdjustments } from '../types';

/** The Other Adjustments status of the active semester, plus a way to save the answers that are kept with the settings. */
export function useOtherAdjustments() {
  const { journalEntries, accounts, openingBalances, accountBalances, settings, updateSettings } = useFinance();
  const semesterKey = adjustmentSemesterKey(settings.reportingYear, settings.semester);
  const record = settings.otherAdjustments?.[semesterKey];
  const status = useMemo(
    () => computeOtherAdjustments({ entries: journalEntries, accounts, openingBalances, accountBalances, semester: settings.semester, reportingYear: settings.reportingYear, record }),
    [journalEntries, accounts, openingBalances, accountBalances, settings.semester, settings.reportingYear, record],
  );
  const saveRecord = (change: (current: SemesterAdjustments) => SemesterAdjustments) => {
    updateSettings({ otherAdjustments: { ...(settings.otherAdjustments || {}), [semesterKey]: change(record || {}) } });
  };
  return { status, record, semesterKey, saveRecord };
}
