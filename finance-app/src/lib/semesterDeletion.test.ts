import { describe, expect, it } from 'vitest';
import { FinancialStatementHistoryRecord, ReportingPeriodWorkspace } from '../types';
import { deleteSemesterRecords, precedingSemester } from './semesterDeletion';

const workspace = (year: number, semester: '1st Semester' | '2nd Semester'): ReportingPeriodWorkspace => ({
  key: `${year}-${year + 1}::${semester}`, schoolYear: `${year}-${year + 1}`, reportingYear: year, semester,
  createdAt: '', updatedAt: '', journalEntries: [], projects: [], closedFiscalYears: [],
  receiptAttachments: [], activityFeeRecords: [], draftTransactions: [], openingBalances: { '1010': 100 },
});

describe('semester deletion', () => {
  it('removes only the selected workspace and all its statement snapshots', () => {
    const first = workspace(2025, '1st Semester');
    const second = workspace(2025, '2nd Semester');
    const next = workspace(2026, '1st Semester');
    const history = [first, second, second, next].map((item, index) => ({
      schoolYear: item.schoolYear, semester: item.semester, id: String(index),
    })) as FinancialStatementHistoryRecord[];
    const result = deleteSemesterRecords([first, second, next], history, second.key);
    expect(result.workspaces).toEqual([first, next]);
    expect(result.workspaces[1]).toBe(next);
    expect(result.history.map(item => item.id)).toEqual(['0', '3']);
    expect(history).toHaveLength(4);
  });
  it('allows deleting the last semester and rejects a stale selection', () => {
    const first = workspace(2025, '1st Semester');
    expect(deleteSemesterRecords([first], [], first.key).workspaces).toEqual([]);
    expect(() => deleteSemesterRecords([], [], first.key)).toThrow('no longer exists');
  });
  it('recreates a semester from its chronological predecessor, never from a later semester', () => {
    const first = workspace(2025, '1st Semester');
    const later = workspace(2026, '1st Semester');
    expect(precedingSemester([later, first], 2025, '2nd Semester')).toBe(first);
    expect(precedingSemester([later], 2025, '1st Semester')).toBeUndefined();
    const second = workspace(2025, '2nd Semester');
    expect(precedingSemester([first, second], 2026, '1st Semester')).toBe(second);
  });
});
