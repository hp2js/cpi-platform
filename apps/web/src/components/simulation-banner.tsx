import type { Role, Session } from '@cpi/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FlaskConical, Info } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { sessionQuery } from '@/features/session/queries';
import { formatDateTime, formatShortDateTime } from '@/lib/dates';

/** Where each role reads the scoring rules in use; institutions see no scoring before results. */
function RulesLink({ role, profileId }: { role: Role; profileId: string }) {
  switch (role) {
    case 'administrator':
      return (
        <Link
          to="/admin/profiles/$profileId"
          params={{ profileId }}
          className="usa-link"
        >
          Scoring profile
        </Link>
      );
    case 'officer':
      return (
        <Link to="/officer/rules" className="usa-link">
          Rules in use
        </Link>
      );
    case 'supervisor':
      return (
        <Link to="/supervisor/rules" className="usa-link">
          Rules in use
        </Link>
      );
    default:
      return null;
  }
}

/**
 * Keeps the banner current in every open tab: the session (run, business time, profile) is
 * re-read every minute and when the window regains focus. When someone else advances or
 * resets the clock, every screen is refetched, as it is for the administrator who did it.
 */
function useLiveClock(initial: Session) {
  const queryClient = useQueryClient();
  const { data = initial } = useQuery({
    ...sessionQuery,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  });
  const key = `${data.clock.runId}|${data.clock.businessTime}|${data.profile.id}`;
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'session',
    });
  }, [key, queryClient]);
  return data;
}

/**
 * Always-visible reminder that business time is simulated and the scoring profile is a
 * demonstration profile, not official EACC scoring (PRD §7.1, FR14). Every value is live from
 * the session: the run, the business time in the cycle's time zone and the cycle's profile.
 * "About this simulation" explains each one and, for staff, links to where it is managed.
 */
export function SimulationBanner({ session: initial }: { session: Session }) {
  const session = useLiveClock(initial);
  const { clock, profile, user } = session;
  const official = !profile.simulation;
  return (
    <div
      role="region"
      aria-label="Simulation status"
      className="border-b border-accent-warm-dark bg-accent-warm-lighter text-ink"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1 text-xs tablet:gap-x-4 tablet:px-6">
        <span className="inline-flex items-center gap-1 rounded-sm bg-accent-warm px-2 py-1 font-bold">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Simulation
        </span>
        <span>
          <span className="sr-only tablet:not-sr-only">Business time </span>
          <time dateTime={clock.businessTime} className="font-bold">
            <span className="tablet:hidden">
              {formatShortDateTime(clock.businessTime)}
            </span>
            <span className="hidden tablet:inline">
              {formatDateTime(clock.businessTime)}
            </span>
          </time>
        </span>
        <span>
          {/* Phones keep the two facts that matter (simulated time, not official scoring) on
              about one line, so the pinned chrome leaves room for the page. */}
          <span className="sr-only tablet:not-sr-only">Scoring </span>
          <span className="hidden font-bold tablet:inline">{profile.name}</span>
          {!official && (
            <>
              <span className="tablet:hidden">Not official scoring</span>
              <span className="hidden tablet:inline">
                {' '}
                · simulation profile, not official EACC scoring
              </span>
            </>
          )}
          {official && <span className="tablet:hidden">{profile.name}</span>}
        </span>
        <Popover>
          {/* 44 px target without growing the bar: an invisible ::after takes the pointer. */}
          <PopoverTrigger
            data-print-hide
            className="relative ml-auto inline-flex items-center gap-1 px-1 py-1 font-bold underline underline-offset-2 after:absolute after:top-1/2 after:left-1/2 after:h-touch after:w-[max(100%,var(--spacing-touch))] after:-translate-x-1/2 after:-translate-y-1/2 hover:text-primary"
          >
            <Info className="size-4" aria-hidden="true" />
            <span className="sr-only tablet:not-sr-only">
              About this simulation
            </span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-4 text-sm">
            <h2 className="font-bold">About this simulation</h2>
            <dl className="mt-3 grid gap-3">
              <div>
                <dt className="text-xs font-bold text-base-dark uppercase">
                  Business time
                </dt>
                <dd>
                  <time dateTime={clock.businessTime}>
                    {formatDateTime(clock.businessTime)}
                  </time>{' '}
                  ({clock.timezone})
                </dd>
                <dd className="text-base-dark">
                  Deadlines, reminders and late flags follow this clock, not
                  today’s date. Audit records keep actual time as well.
                </dd>
                {user.role === 'administrator' && (
                  <dd>
                    <Link to="/admin/simulation" className="usa-link">
                      Simulation clock
                    </Link>
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs font-bold text-base-dark uppercase">
                  Scoring profile
                </dt>
                <dd>
                  {profile.name}
                  {!official && ' · simulation profile'}
                </dd>
                <dd className="text-base-dark">
                  {official
                    ? 'The approved profile for this cycle.'
                    : 'Weights and checks for trying the method out. Scores are not official EACC scoring.'}
                </dd>
                {user.role !== 'institution' && (
                  <dd>
                    <RulesLink role={user.role} profileId={profile.id} />
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs font-bold text-base-dark uppercase">
                  Run
                </dt>
                <dd>{clock.runId}</dd>
                <dd className="text-base-dark">
                  Identifies this simulation run. Resetting the simulation
                  starts a new run with fresh reports and results.
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t pt-3 text-xs text-base-dark">
              Every institution, person and record is fictional.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
