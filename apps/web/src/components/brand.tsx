import logoOnDark from '@/assets/brand/adili-logo-on-dark.svg';
import logo from '@/assets/brand/adili-logo.svg';

/**
 * The Adili logo with the product's name beside it: CPI, the Corruption Prevention Indicator. The purple logo sits on light
 * backgrounds; on the purple sidebar its purple becomes white, as in the supplied on-dark
 * version. The Adili marks were supplied by the Adili V3 challenge organizers.
 */
export function Brand({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span className="flex items-center gap-3">
      <img
        src={tone === 'dark' ? logoOnDark : logo}
        alt="Adili Online"
        width={520}
        height={160}
        className="h-10 w-auto shrink-0"
      />
      <span
        className={
          tone === 'dark'
            ? 'border-l border-white/40 pl-3 text-lg leading-none font-bold tracking-wide text-white'
            : 'border-l border-base-lighter pl-3 text-lg leading-none font-bold tracking-wide text-base-darker'
        }
      >
        <abbr title="Corruption Prevention Indicator" className="no-underline">
          CPI
        </abbr>
      </span>
    </span>
  );
}
