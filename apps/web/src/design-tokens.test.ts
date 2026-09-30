import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageSlots } from '@/components/list-controls';
import { buttonVariants } from '@/components/ui/button';

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

describe('Button sizes', () => {
  it('keeps a 44 px target on every size, however compact it looks', () => {
    for (const size of [
      'default',
      'xs',
      'sm',
      'lg',
      'icon',
      'icon-xs',
      'icon-sm',
      'icon-lg',
    ] as const) {
      const classes = buttonVariants({ size }).split(' ');
      const visible =
        classes.some((c) => /^(?:min-h|size)-(?:touch|12)$/.test(c)) ||
        classes.includes('after:h-touch');
      expect(visible, size).toBe(true);
    }
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

// Read the token source so palette edits cannot silently regress text contrast. Read from
// disk: Vitest's CSS handling returns an empty string for a `?raw` stylesheet import.
// Vitest runs in the package directory.
const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
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
describe('Adili palette contrast', () => {
  it.each([
    ['white', 'primary'],
    ['white', 'primary-dark'],
    ['white', 'primary-darker'],
    ['primary', 'primary-lighter'],
    ['primary', 'accent-warm'],
    ['ink', 'accent-warm'],
    ['accent-warm-darker', 'accent-warm'],
    // Adili neutrals: body, secondary and hint text on every surface they sit on.
    ['ink', 'white'],
    ['ink', 'canvas'],
    ['ink', 'base-lighter'],
    ['base-darker', 'white'],
    ['base-dark', 'white'],
    ['base-dark', 'canvas'],
    ['base-dark', 'base-lightest'],
    ['base', 'white'],
    ['base', 'canvas'],
    // The demonstration panel on the sign-in page.
    ['base-dark', 'accent-warm-lighter'],
    ['primary', 'accent-warm-lighter'],
    // The simulation bar.
    ['ink', 'accent-warm-lighter'],
    // Disabled text and ticks on the disabled fill, and disabled buttons' text.
    ['disabled-dark', 'disabled-lighter'],
    ['white', 'secondary'],
    ['white', 'secondary-dark'],
    ['white', 'secondary-darker'],
  ])('%s text is readable on %s', (foreground, background) => {
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Focus indicator contrast', () => {
  // WCAG 1.4.11 / 2.4.13: the ring needs 3:1 against every surface it is drawn on.
  it.each([
    ['focus', 'white'],
    ['focus', 'canvas'],
    ['focus', 'base-lightest'],
    ['focus', 'primary-lighter'],
    ['focus', 'accent-warm-lighter'],
    ['focus-on-dark', 'primary'],
    ['focus-on-dark', 'primary-dark'],
    // A disabled field still focuses (read-only) or shows its ring beside the fill.
    ['focus', 'disabled-lighter'],
    // Scroll bar thumbs: base on light surfaces.
    ['base', 'white'],
    ['base', 'base-lightest'],
    // The simulation bar's bottom edge against its own fill.
    ['accent-warm-dark', 'accent-warm-lighter'],
  ])('%s ring is visible on %s', (ring, surface) => {
    const light = Math.max(luminance(ring), luminance(surface));
    const dark = Math.min(luminance(ring), luminance(surface));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(3);
  });
});

describe('Disabled state', () => {
  // Exempt from WCAG contrast, but it must still read as a control and stay legible.
  it.each([
    ['disabled', 'white', 3],
    ['disabled-light', 'white', 2],
  ])('%s is visible on %s', (foreground, background, minimum) => {
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(minimum);
  });
});
