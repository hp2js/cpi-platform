import type { Session } from '@cpi/contracts';
import { FlaskConical } from 'lucide-react';
import { formatDateTime } from '@/lib/dates';

/**
 * Always-visible reminder that business time is simulated and the scoring profile is a
 * demonstration profile, not official EACC scoring (PRD §7.1, FR14).
 */
export function SimulationBanner({ session }: { session: Session }) {
  return (
    <div className="border-b border-secondary-foreground/15 bg-secondary text-secondary-foreground">
      <p className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Simulation
        </span>
        <span>
          Business time:{' '}
          <time dateTime={session.clock.businessTime}>
            {formatDateTime(session.clock.businessTime)}
          </time>
        </span>
        <span>Run {session.clock.runId}</span>
        {session.profile.simulation && (
          <span>
            {session.profile.name} · simulation profile, not official EACC
            scoring
          </span>
        )}
      </p>
    </div>
  );
}
