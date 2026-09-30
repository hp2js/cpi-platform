import { describe, expect, it } from 'vitest';
import { pageSlots } from '@/components/list-controls';

/**
 * Guards the USWDS token layer (design-system/MASTER.md). Tailwind silently drops classes whose
 * tokens were reset, so a leftover `bg-muted`, `sm:` or `rounded-xl` would ship as no styling.
 */
const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const token =
  /(?<=^|[\s"'`{])(?:[^\s"'`{}]*:)?(-?[a-z][^\s"'`{}]*)(?=$|[\s"'`}])/gm;

function classesMatching(pattern: RegExp) {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(sources))
    for (const [whole, core] of text.matchAll(token))
      if (pattern.test(core!) || pattern.test(whole))
        hits.push(`${file}: ${whole}`);
  return hits;
}

describe('USWDS design tokens', () => {
  it('uses only the USWDS spacing units for padding, margin and gaps', () => {
    // 4 px Tailwind steps: 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32 … 30=120 px.
    const onScale = new Set([
      '0',
      'px',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '8',
      '10',
      '12',
      '14',
      '16',
      '18',
      '20',
      '30',
      'auto',
    ]);
    const spacing =
      /^-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-([^\s/]+)$/;
    const off = classesMatching(spacing).filter((hit) => {
      const value = hit.split(/[\s:]/).at(-1)!.match(spacing)?.[1];
      return (
        value !== undefined &&
        !onScale.has(value) &&
        !value.startsWith('[') &&
        !value.startsWith('(')
      );
    });
    expect(off).toEqual([]);
  });

  it('uses no token that the USWDS theme removed', () => {
    const removed =
      /^(?:(?:bg|text|border|ring|fill|stroke|outline|divide)-(?:muted|accent|card|popover|background|foreground|destructive|input|ring|border|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?:\/\d+)?|rounded(?:-[trblse]{1,2})?-(?:xs|xl|2xl|3xl)|shadow-(?:xs|sm|md|lg|xl|2xl)|font-(?:thin|extralight|medium|semibold|extrabold|black)|text-(?:4xl|5xl)|max-w-(?:xs|sm|md|lg|xl|[2-7]xl|prose)|animate-(?:in|out)|(?:min-h|h|size|min-w)-11|opacity-(?:50|60|70)|border-dashed|backdrop-blur(?:-\S+)?|(?:sm|md|lg|xl|2xl|dark):.+)$/;
    expect(classesMatching(removed)).toEqual([]);
  });
});

describe('pageSlots', () => {
  it('keeps first, last and neighbours of the current page, with gaps', () => {
    expect(pageSlots(0, 1)).toEqual([0]);
    expect(pageSlots(0, 3)).toEqual([0, 1, 2]);
    expect(pageSlots(4, 10)).toEqual([0, null, 3, 4, 5, null, 9]);
    expect(pageSlots(9, 10)).toEqual([0, null, 8, 9]);
  });
});

// Read runtime values so palette edits cannot silently regress branded text contrast.
const styles = import.meta.glob<string>('./styles.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})['./styles.css']!;
function luminance(name: string) {
  const hex = styles.match(
    new RegExp(`--color-${name}:\\s*(#[a-f0-9]{6})`, 'i'),
  )?.[1];
  if (!hex) throw new Error(`Missing colour token ${name}`);
  const [r, g, b] = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
}
describe('Adili brand contrast', () => {
  it.each([
    ['white', 'primary'],
    ['white', 'primary-dark'],
    ['white', 'primary-darker'],
    ['primary', 'primary-lighter'],
    ['primary', 'accent-warm'],
    ['ink', 'accent-warm'],
    ['accent-warm-darker', 'accent-warm'],
  ])('%s text is readable on %s', (foreground, background) => {
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
