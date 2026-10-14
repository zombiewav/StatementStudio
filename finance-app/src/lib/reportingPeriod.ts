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

/** Header line for the Statement of Activities, Functional Expenses and Cash Flows,
 * e.g. "For the period ended December 31, 2026" (1st semester) or "...May 31, 2027" (2nd). */
export function periodEndedLabel(endDate: string): string {
  const date = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'For the period ended';
  return `For the period ended ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

/** Local calendar date as YYYY-MM-DD. toISOString() is UTC, a day behind in the Philippines before 8am. */
export function localDateString(now: Date = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Date for entries the system dates itself: today if it falls in the reporting period, else the period's last day. */
export function automaticPostingDate(semester: Semester | '' | undefined, reportingYear: number | undefined, today: string = localDateString()): string {
  if (!semester || !reportingYear) return today;
  const { startDate, endDate } = reportingPeriodBounds(semester, reportingYear);
  return today >= startDate && today <= endDate ? today : endDate;
}

export function isDateWithinReportingPeriod(date: string, semester: Semester, reportingYear: number): boolean {
  const { startDate, endDate } = reportingPeriodBounds(semester, reportingYear);
  return date >= startDate && date <= endDate;
}

/** The semester that today's date falls in (Aug-Dec = 1st, Jan-May = 2nd); June and July look ahead to the next 1st semester. */
export function currentSemester(today: string = localDateString()): { semester: Semester; reportingYear: number } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month >= 6 ? { semester: '1st Semester', reportingYear: year } : { semester: '2nd Semester', reportingYear: year - 1 };
}

/**
 * Temporary client rule: only the semester for today's date can be added, so only one set of
 * statements can be built at a time. Saved semesters can always be opened.
 * Returns an error message, or '' when the semester may be added or opened.
 */
export function newSemesterBlock(semester: Semester, reportingYear: number, alreadySaved: boolean, today: string = localDateString()): string {
  if (alreadySaved) return '';
  const current = currentSemester(today);
  if (semester === current.semester && reportingYear === current.reportingYear) return '';
  const base = `Only the current semester (${current.semester} of SY ${current.reportingYear}-${current.reportingYear + 1}) can be added for now.`;
  const next = current.semester === '1st Semester'
    ? { semester: '2nd Semester', reportingYear: current.reportingYear }
    : { semester: '1st Semester', reportingYear: current.reportingYear + 1 };
  if (semester === next.semester && reportingYear === next.reportingYear) {
    return `${base} The ${semester} can be added after ${reportingPeriodBounds(current.semester, current.reportingYear).endDate}.`;
  }
  return base;
}
