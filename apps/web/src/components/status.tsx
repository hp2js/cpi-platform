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
    className: 'bg-muted text-muted-foreground',
  },
  draft: {
    label: 'Draft',
    icon: PencilLine,
    className: 'bg-muted text-foreground',
  },
  submitted: {
    label: 'Submitted, awaiting review',
    icon: FileCheck,
    className: 'bg-accent text-accent-foreground',
  },
  under_review: {
    label: 'Under officer review',
    icon: ScanSearch,
    className: 'bg-accent text-accent-foreground',
  },
  clarification_requested: {
    label: 'Clarification requested',
    icon: MessageCircleQuestion,
    className: 'bg-secondary text-secondary-foreground',
  },
  finalized: {
    label: 'Finalized',
    icon: CircleCheck,
    className: 'bg-success text-success-foreground',
  },
  closed_without_submission: {
    label: 'Closed without submission',
    icon: Ban,
    className: 'bg-muted text-foreground',
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
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
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
};

export function flagLabel(flag: ObligationFlag) {
  return flags[flag].label;
}

export function FlagChip({ flag }: { flag: ObligationFlag }) {
  const { label, icon: Icon, tone } = flags[flag];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs whitespace-nowrap',
        tone === 'warning'
          ? 'border-destructive/40 text-destructive'
          : 'text-muted-foreground',
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
    <span className="flex flex-wrap gap-1.5">
      {list.map((flag) => (
        <FlagChip key={flag} flag={flag} />
      ))}
    </span>
  );
}
