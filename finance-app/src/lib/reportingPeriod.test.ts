import { describe, expect, it } from 'vitest';
import { parseReportingYear, periodForSemester, semesterForPeriod } from './reportingPeriod';

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
});
