import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('USWDS class merging', () => {
  it('keeps text sizes separate from the base text colour', () => {
    expect(cn('text-xs text-base')).toBe('text-xs text-base');
    expect(cn('text-base text-xs')).toBe('text-base text-xs');
    expect(cn('text-white', 'text-base')).toBe('text-base');
    expect(cn('text-xs', 'text-md')).toBe('text-md');
  });
  it('lets callers replace custom container widths at the same breakpoint', () => {
    expect(cn('max-w-mobile-lg', 'max-w-tablet')).toBe('max-w-tablet');
    expect(cn('tablet:max-w-mobile-lg', 'tablet:max-w-measure')).toBe(
      'tablet:max-w-measure',
    );
    expect(cn('max-w-mobile-lg', 'tablet:max-w-desktop')).toBe(
      'max-w-mobile-lg tablet:max-w-desktop',
    );
  });
});
