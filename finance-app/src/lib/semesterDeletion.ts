import { FinancialStatementHistoryRecord, ReportingPeriodWorkspace } from '../types';

export function deleteSemesterRecords(
  workspaces: ReportingPeriodWorkspace[],
  history: FinancialStatementHistoryRecord[],
  key: string,
) {
  const target = workspaces.find(workspace => workspace.key === key);
  if (!target) throw new Error('This semester no longer exists.');
  return {
    target,
    workspaces: workspaces.filter(workspace => workspace.key !== key),
    history: history.filter(record => record.schoolYear !== target.schoolYear || record.semester !== target.semester),
  };
}

export function precedingSemester(workspaces: ReportingPeriodWorkspace[], reportingYear: number, semester: '1st Semester' | '2nd Semester') {
  const order = (year: number, sem: string) => year * 2 + (sem === '2nd Semester' ? 1 : 0);
  const targetOrder = order(reportingYear, semester);
  return workspaces.filter(workspace => order(workspace.reportingYear, workspace.semester) < targetOrder)
    .sort((a, b) => order(b.reportingYear, b.semester) - order(a.reportingYear, a.semester))[0];
}
