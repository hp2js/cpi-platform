/** Text wordmark, as the USWDS header's usa-logo: no monogram, seal or agency mark. */
export function Brand({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={
        tone === 'dark'
          ? 'block border-l-4 border-accent-warm pl-3 text-lg leading-tight font-bold text-white'
          : 'block border-l-4 border-accent-warm pl-3 text-lg leading-tight font-bold text-primary'
      }
    >
      CPI Platform
      <span
        className={
          tone === 'dark'
            ? 'hidden text-xs font-normal text-white tablet:block'
            : 'hidden text-xs font-normal text-base-dark tablet:block'
        }
      >
        Corruption prevention reporting
      </span>
    </span>
  );
}
