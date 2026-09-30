import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge, validators } from 'tailwind-merge';

// Keep merging in step with styles.css: `text-base` is a colour here, and
// custom container widths must replace each other when a caller widens a dialog.
const merge = extendTailwindMerge({
  override: {
    classGroups: {
      'font-size': [
        {
          text: [
            '3xs',
            '2xs',
            'xs',
            'sm',
            'md',
            'lg',
            'xl',
            '2xl',
            '3xl',
            validators.isArbitraryVariableLength,
            validators.isArbitraryLength,
          ],
        },
      ],
    },
  },
  extend: {
    theme: {
      container: [
        'mobile',
        'mobile-lg',
        'tablet',
        'tablet-lg',
        'desktop',
        'desktop-lg',
        'widescreen',
        'measure',
      ],
    },
  },
});
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
