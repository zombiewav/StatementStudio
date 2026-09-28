import { describe, expect, it } from 'vitest';
import { parseReportingYear, periodForSemester, reportingPeriodBounds, semesterForPeriod } from './reportingPeriod';

describe('reporting period fields', () => {
  it('keeps semester and period choices consistent', () => {
    expect(periodForSemester('1st Semester')).toBe('August to December');
    expect(periodForSemester('2nd Semester')).toBe('January to May');
    expect(semesterForPeriod('August to December')).toBe('1st Semester');
    expect(semesterForPeriod('January to May')).toBe('2nd Semester');
  });

  it('accepts a four-digit year and rejects incomplete years', () => {
    expect(parseReportingYear('2021')).toBe(2021);
    expect(() => parseReportingYear('21')).toThrow('four digits');
    expect(() => parseReportingYear('')).toThrow('four digits');
  });

  it('computes the exact semester boundaries for a school year', () => {
    expect(reportingPeriodBounds('1st Semester', 2021)).toEqual({ startDate: '2021-08-01', endDate: '2021-12-31' });
    expect(reportingPeriodBounds('2nd Semester', 2021)).toEqual({ startDate: '2022-01-01', endDate: '2022-05-31' });
  });
});
