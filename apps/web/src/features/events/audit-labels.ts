/**
 * Plain-language names for audit actions (HP2-54). The code stays the record: it is shown
 * beside the label, filtered on and exported in the CSV.
 */
const labels = new Map<string, string>(
  Object.entries({
    'account.activate': 'Account activated',
    'account.update': 'Own account updated',
    'amendment.request': 'Amendment requested',
    'amendment.confirmed': 'Amendment confirmed',
    'amendment.declined': 'Amendment declined',
    'assignment.conflict_declared': 'Conflict of interest declared',
    'assignment.cover': 'Temporary cover arranged',
    'assignment.suggestion_dismiss': 'Reassignment suggestion dismissed',
    'audit.csv': 'Audit log exported',
    'baseline.approve': 'Baseline approved',
    'baseline.confirm_seed': 'Seeded baseline confirmed',
    'baseline.propose': 'Baseline proposed',
    'baseline.return': 'Baseline returned for revision',
    'calendar.update': 'Reporting calendar changed',
    'clarification.close_unanswered': 'Clarification closed unanswered',
    'clarification.request': 'Clarification requested',
    'correction.open': 'Correction case opened',
    'decision.carry_forward': 'Earlier decision carried forward',
    'decision.record': 'Milestone decision recorded',
    'delivery.retry': 'Email delivery retried',
    'evaluation.extension': 'Evaluation extension granted',
    'evidence.access': 'File opened by an administrator',
    'evidence.replace': 'Evidence file replaced',
    'evidence.suitability': 'Evidence suitability checked',
    'evidence.upload': 'Evidence file uploaded',
    'financial_year.discard': 'Planned financial year discarded',
    'financial_year.plan': 'Financial year planned',
    'financial_year.update': 'Planned financial year changed',
    'form.discard': 'Draft form version discarded',
    'form.draft_create': 'Draft form version started',
    'form.draft_save': 'Draft form version saved',
    'form.publish': 'Form version published',
    'foundation.review': 'Foundation document reviewed',
    'foundation.upload': 'Foundation document uploaded',
    'foundation.withdraw': 'Foundation document withdrawn',
    'institution.accounting_officer': 'Accounting Officer changed',
    'institution.create': 'Institution added',
    'institution.import': 'Institutions imported',
    'institution.update': 'Institution updated',
    'institution_type.create': 'Institution type added',
    'institution_type.update': 'Institution type updated',
    'obligation.close_nonresponse': 'Closed without submission',
    'plan.activity_add': 'Plan activity added',
    'plan.activity_remove': 'Plan activity removed',
    'plan.activity_update': 'Plan activity changed',
    'plan.approval_record': 'Plan approval recorded',
    'plan.import': 'Plan imported',
    'plan.milestone_add': 'Planned milestone added',
    'plan.milestone_remove': 'Planned milestone removed',
    'plan.milestone_update': 'Planned milestone changed',
    'plan.risk_add': 'Risk added',
    'plan.risk_remove': 'Risk removed',
    'plan.risk_update': 'Risk changed',
    'profile.apply': 'Scoring profile applied to the cycle',
    'profile.approve': 'Scoring profile approved',
    'profile.create': 'Scoring profile created',
    'profile.delete': 'Scoring profile deleted',
    'profile.update': 'Scoring profile changed',
    'publication.correct': 'Published result corrected',
    'publication.publish': 'Annual result published',
    'review.comment': 'Supervisor comment added',
    'review.comment_addressed': 'Supervisor comment addressed',
    'review.finalize': 'Review finalized',
    'review.override': 'Administrator override',
    'review.reopen': 'Review reopened',
    'session.sign_in': 'Signed in',
    'settings.risk_scale': 'Risk rating scale changed',
    'simulation.advance': 'Simulation clock advanced',
    'simulation.reset': 'Simulation reset',
    'submission.submit': 'Report submitted',
    'supervision.change': 'Supervisor assignment changed',
    'support.draft_view': 'Draft viewed for support',
    'user.create': 'User added',
    'user.invite': 'User invited',
    'user.reactivate': 'User reactivated',
    'user.role_change': 'User role changed',
    'user.update': 'User updated',
  }),
);

/** "plan.risk_add" → "Plan risk add" for an action recorded after this list was written. */
function fromCode(code: string) {
  const words = code.replace(/[._]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditActionLabel(code: string) {
  return labels.get(code) ?? fromCode(code);
}

const objectLabels = new Map<string, string>(
  Object.entries({
    form: 'Form',
    submission: 'Submission',
    decision: 'Decision',
    clarification: 'Clarification',
    evidence: 'Evidence',
    baseline: 'Baseline',
    amendment: 'Amendment',
    foundation: 'Foundation document',
    obligation: 'Quarter report',
    assignment: 'Assignment',
    supervision: 'Supervision',
    user: 'User',
    institution: 'Institution',
    publication: 'Publication',
    simulation: 'Simulation',
    delivery: 'Email delivery',
  }),
);

export function auditObjectLabel(type: string) {
  return objectLabels.get(type) ?? fromCode(type);
}
