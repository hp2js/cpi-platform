import type { Session } from '@cpi/contracts';
import { FlaskConical } from 'lucide-react';
import { formatDateTime } from '@/lib/dates';

/**
 * Always-visible reminder that business time is simulated and the scoring profile is a
 * demonstration profile, not official EACC scoring (PRD §7.1, FR14).
 */
export function SimulationBanner({ session }: { session: Session }) {
  return (
    <div className="border-b border-ink bg-warning-lighter text-ink">
      <p className="mx-auto flex max-w-widescreen flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 text-xs tablet:gap-x-4 tablet:px-6 tablet:py-2">
        <span className="inline-flex items-center gap-2 font-bold">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Simulation
        </span>
        <span>
          {/* Phones keep the two facts that matter (simulated time, not official scoring) on
              about one line, so the pinned chrome leaves room for the page. */}
          <span className="sr-only tablet:not-sr-only">Business time: </span>
          <time dateTime={session.clock.businessTime}>
            {formatDateTime(session.clock.businessTime)}
          </time>
        </span>
        <span className="hidden tablet:inline">Run {session.clock.runId}</span>
        {session.profile.simulation && (
          <>
            <span className="tablet:hidden">Not official scoring</span>
            <span className="hidden tablet:inline">
              {session.profile.name} · simulation profile, not official EACC
              scoring
            </span>
          </>
        )}
      </p>
    </div>
  );
}
