/** Text wordmark, as the USWDS header's usa-logo: no monogram, seal or agency mark. */
export function Brand({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={
        tone === 'dark'
          ? 'block text-lg leading-tight font-bold text-white'
          : 'block text-lg leading-tight font-bold text-ink'
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
