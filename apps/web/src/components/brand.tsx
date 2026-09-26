export function Brand({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold">
      <span
        className={
          tone === 'dark'
            ? 'flex size-8 items-center justify-center rounded-md bg-secondary text-sm text-secondary-foreground'
            : 'flex size-8 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground'
        }
        aria-hidden="true"
      >
        C
      </span>
      <span className="leading-tight">
        CPI Platform
        <span
          className={
            tone === 'dark'
              ? 'hidden text-xs font-normal text-primary-foreground/70 sm:block'
              : 'hidden text-xs font-normal text-muted-foreground sm:block'
          }
        >
          Corruption prevention reporting
        </span>
      </span>
    </span>
  );
}
