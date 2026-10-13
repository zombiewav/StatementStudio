import { describe, expect, it } from 'vitest';

// Vitest blanks every CSS import, so the stylesheet is read from disk. Node types are not
// installed in this project, hence the ignore: this file only ever runs under vitest (node).
async function loadCss(): Promise<string> {
  // @ts-ignore
  const { readFileSync } = await import('node:fs');
  return readFileSync(new URL('./index.css', import.meta.url), 'utf-8') as string;
}

const variable = (css: string, name: string): string => {
  const matches = [...css.matchAll(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`, 'g'))];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
};
const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('dark mode text readability', () => {
  const surfaces = ['#12151b', '#0b0d11', '#171b22'];

  it('readable grey text reaches WCAG AAA (7:1) on every dark surface', async () => {
    const css = await loadCss();
    surfaces.forEach(surface => expect(contrast(variable(css, 'text-readable'), surface)).toBeGreaterThanOrEqual(7));
  });

  it('placeholders reach WCAG AA (4.5:1) on every dark surface', async () => {
    const css = await loadCss();
    surfaces.forEach(surface => expect(contrast(variable(css, 'placeholder-readable'), surface)).toBeGreaterThanOrEqual(4.5));
  });

  it('the old slate-600 form text did not', () => {
    expect(contrast('#565963', '#12151b')).toBeLessThan(3);
  });

  it('lifts form text, placeholders and disabled fields in dark mode only', async () => {
    const css = await loadCss();
    expect(css).toContain('.dark ::placeholder');
    expect(css).toMatch(/\.dark :is\(input, select, textarea, button\):disabled/);
    expect(css).toMatch(/\.dark :is\(\.text-slate-600, \.text-slate-500, \.text-slate-400/);
  });
});
