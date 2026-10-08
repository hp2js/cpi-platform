import { cn } from '@/lib/utils';

/**
 * Shows or hides a preview panel beside an editor. A switch, so its state is announced as on
 * or off and shown by the track as well as the words, never by colour alone.
 */
export function PreviewSwitch({
  shown,
  onChange,
  controls,
  label = 'Preview',
}: {
  shown: boolean;
  onChange: (shown: boolean) => void;
  /** The panel's ID, while it is rendered. */
  controls?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-controls={controls}
      onClick={() => onChange(!shown)}
      className="inline-flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-bold text-ink hover:bg-base-lightest"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200',
          shown ? 'border-primary bg-primary' : 'border-base-dark bg-white',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full transition-transform duration-200',
            shown ? 'translate-x-5.5 bg-white' : 'translate-x-0.5 bg-base-dark',
          )}
        />
      </span>
      {label}
      <span className="w-6 font-normal text-base-dark" aria-hidden="true">
        {shown ? 'On' : 'Off'}
      </span>
    </button>
  );
}
