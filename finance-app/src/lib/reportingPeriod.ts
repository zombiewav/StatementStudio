export type Semester = '1st Semester' | '2nd Semester';
export type ReportingPeriodRange = 'August to December' | 'January to May';

export const SEMESTER_OPTIONS: Semester[] = ['1st Semester', '2nd Semester'];
export const REPORTING_PERIOD_OPTIONS: ReportingPeriodRange[] = ['August to December', 'January to May'];

export const periodForSemester = (semester: Semester): ReportingPeriodRange => (
  semester === '1st Semester' ? 'August to December' : 'January to May'
);

export const semesterForPeriod = (period: ReportingPeriodRange): Semester => (
  period === 'August to December' ? '1st Semester' : '2nd Semester'
);

export function parseReportingYear(value: string): number {
  const trimmed = value.trim();
  if (!/^\d{4}$/.test(trimmed)) throw new Error('Please enter the reporting year using four digits, such as 2021.');
  return Number(trimmed);
}

export function parseSchoolYear(value: string): { startYear: number; endYear: number; label: string } {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{4})$/.exec(trimmed);
  if (!match) throw new Error('Enter the school year as YYYY-YYYY, such as 2021-2022.');
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) throw new Error('The second school year must immediately follow the first, such as 2021-2022.');
  return { startYear, endYear, label: `${startYear}-${endYear}` };
}

export function reportingPeriodBounds(semester: Semester, reportingYear: number): { startDate: string; endDate: string } {
  return semester === '1st Semester'
    ? { startDate: `${reportingYear}-08-01`, endDate: `${reportingYear}-12-31` }
    : { startDate: `${reportingYear + 1}-01-01`, endDate: `${reportingYear + 1}-05-31` };
}

export function isDateWithinReportingPeriod(date: string, semester: Semester, reportingYear: number): boolean {
  const { startDate, endDate } = reportingPeriodBounds(semester, reportingYear);
  return date >= startDate && date <= endDate;
}
