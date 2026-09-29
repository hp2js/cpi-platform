import type { ObligationFlag, Role, WorkflowState } from '@cpi/contracts';
import {
  AlarmClock,
  Ban,
  CircleCheck,
  CircleDashed,
  Clock,
  FileCheck,
  FileWarning,
  MessageCircleQuestion,
  PencilLine,
  Hourglass,
  RefreshCcw,
  ScanSearch,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StateStyle {
  label: string;
  icon: LucideIcon;
  className: string;
}

/** Plain-language state labels (PRD §11). Icons and text carry meaning; colour only reinforces it. */
const states: Record<WorkflowState, StateStyle> = {
  not_started: {
    label: 'Not started',
    icon: CircleDashed,
    className: 'bg-base-lightest text-base-dark',
  },
  draft: {
    label: 'Draft',
    icon: PencilLine,
    className: 'bg-base-lightest text-ink',
  },
  submitted: {
    label: 'Submitted, awaiting review',
    icon: FileCheck,
    className: 'bg-primary-lighter text-primary-darker',
  },
  under_review: {
    label: 'Under officer review',
    icon: ScanSearch,
    className: 'bg-primary-lighter text-primary-darker',
  },
  clarification_requested: {
    label: 'Clarification requested',
    icon: MessageCircleQuestion,
    className: 'bg-warning-lighter text-ink',
  },
  finalized: {
    label: 'Finalized',
    icon: CircleCheck,
    className: 'bg-success-lighter text-success-darker',
  },
  closed_without_submission: {
    label: 'Closed without submission',
    icon: Ban,
    className: 'bg-base-lightest text-ink',
  },
};

/**
 * Institutions see "Review complete" rather than "Finalized" so the label never implies a
 * released result (PRD §7.4).
 */
export function stateLabel(state: WorkflowState, audience?: Role) {
  if (audience === 'institution' && state === 'finalized')
    return 'Review complete';
  return states[state].label;
}

export function WorkflowStateBadge({
  state,
  audience,
}: {
  state: WorkflowState;
  audience?: Role;
}) {
  const { icon: Icon, className } = states[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-bold whitespace-nowrap',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {stateLabel(state, audience)}
    </span>
  );
}

const flags: Record<
  ObligationFlag,
  { label: string; icon: LucideIcon; tone: 'neutral' | 'warning' }
> = {
  not_yet_due: { label: 'Not yet due', icon: Clock, tone: 'neutral' },
  late: { label: 'Late', icon: AlarmClock, tone: 'warning' },
  evidence_incomplete: {
    label: 'Evidence incomplete',
    icon: FileWarning,
    tone: 'warning',
  },
  clarification_overdue: {
    label: 'Clarification overdue',
    icon: TriangleAlert,
    tone: 'warning',
  },
  needs_re_review: {
    label: 'Needs re-review',
    icon: RefreshCcw,
    tone: 'warning',
  },
  review_overdue: {
    label: 'Review past target',
    icon: Hourglass,
    tone: 'warning',
  },
};

export function flagLabel(flag: ObligationFlag) {
  return flags[flag].label;
}

export function FlagChip({ flag }: { flag: ObligationFlag }) {
  const { label, icon: Icon, tone } = flags[flag];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-base-dark px-2 py-1 text-xs whitespace-nowrap',
        tone === 'warning'
          ? 'border-error-dark text-error-dark'
          : 'text-base-dark',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export function FlagList({ flags: list }: { flags: ObligationFlag[] }) {
  if (list.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {list.map((flag) => (
        <FlagChip key={flag} flag={flag} />
      ))}
    </span>
  );
}

/**
 * A quarter's state with its flags. A quarter that has not started and is not yet due is
 * context, not work: it shows one quiet line instead of two tags, so the cells that need
 * action stand out in grids.
 */
export function ObligationStatus({
  state,
  flags: list,
  audience,
}: {
  state: WorkflowState;
  flags: ObligationFlag[];
  audience?: Role;
}) {
  if (state === 'not_started' && list.includes('not_yet_due'))
    return (
      <span className="inline-flex items-center gap-1 text-xs text-base-dark">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        Not yet due
      </span>
    );
  return (
    <>
      <WorkflowStateBadge state={state} audience={audience} />
      <FlagList flags={list} />
    </>
  );
}
