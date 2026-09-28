import type { FormVersion, ScoringProfile } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Badge } from '@/components/ui/badge';
import { cycleQuery } from '@/features/directory/queries';
import { questionTypeLabels } from '@/features/forms/labels';
import { formsQuery } from '@/features/forms/queries';
import { evidenceCategoryLabel } from '@/features/reporting/answers';
import { profilesQuery } from '@/features/settings/queries';
import { formatDateTime } from '@/lib/dates';

function Profile({ profile }: { profile: ScoringProfile }) {
  const rows: [string, string][] = [
    [
      'Procedures',
      profile.proceduresMode === 'prerequisite'
        ? 'Prerequisite, no points'
        : `${profile.weights.procedures} points`,
    ],
    ['Risk assessment', `${profile.weights.riskAssessment} points`],
    ['Mitigation plan', `${profile.weights.mitigationPlan} points`],
    [
      'Implementation',
      `${profile.weights.implementation} points, ${profile.weights.implementation / 4} per quarter`,
    ],
  ];
  const checklists: [string, string[]][] = [
    ['Procedures', profile.checklists.procedures],
    ['Risk assessment', profile.checklists.riskAssessment],
    ['Mitigation plan', profile.checklists.mitigationPlan],
  ];
  return (
    <section
      aria-labelledby="profile-heading"
      className="grid gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Scoring profile: {profile.name}
        </h2>
        <Badge variant="outline">Version {profile.version}</Badge>
        {profile.simulation && (
          <Badge variant="secondary">Simulation profile</Badge>
        )}
      </div>
      {profile.sourceNote && (
        <p className="text-sm text-muted-foreground">{profile.sourceNote}</p>
      )}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([term, detail]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium">{detail}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-muted-foreground">Rounding</dt>
          <dd className="font-medium">Half up, two decimals</dd>
        </div>
      </dl>
      <div className="grid gap-4 md:grid-cols-3">
        {checklists.map(([title, items]) => (
          <div key={title} className="grid content-start gap-1.5">
            <h3 className="text-sm font-semibold">{title} checklist</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function Form({
  form,
  periodLabel,
}: {
  form: FormVersion;
  periodLabel: (id: string) => string;
}) {
  return (
    <section
      aria-labelledby={`form-${form.id}`}
      className="grid gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`form-${form.id}`} className="text-lg font-semibold">
          {form.title}
        </h2>
        <Badge variant="outline">Version {form.version}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Published {form.publishedAt ? formatDateTime(form.publishedAt) : '—'}.
        Used for {form.periodIds.map(periodLabel).join(', ') || 'no quarter'}.
      </p>
      {form.sections.map((section) => (
        <div key={section.id} className="grid gap-2">
          <h3 className="font-semibold">{section.title}</h3>
          {section.description && (
            <p className="text-sm text-muted-foreground">
              {section.description}
            </p>
          )}
          <ul className="divide-y rounded-md border">
            {section.questions.map((question) => (
              <li
                key={question.id}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {question.label}
                  <span className="block text-xs text-muted-foreground">
                    {questionTypeLabels[question.type]}
                    {question.evidenceCategory &&
                      ` · ${evidenceCategoryLabel[question.evidenceCategory]}`}
                    {question.required ? ' · required' : ' · optional'}
                  </span>
                </span>
                <Badge
                  variant={question.kind === 'scored' ? 'default' : 'outline'}
                >
                  {question.kind === 'scored' ? 'Scored' : 'Informational'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * The rules officers apply, read only (PRD §5.2: supervisors read the active form version and
 * scoring rules). Only the administrator changes them.
 */
export function RulesPage() {
  const profiles = useQuery(profilesQuery);
  const forms = useQuery(formsQuery);
  const cycle = useQuery(cycleQuery);
  const periodLabel = (id: string) =>
    cycle.data?.periods.find((period) => period.id === id)?.label ?? id;
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Rules in use"
        description="The scoring profile and published form versions officers apply this cycle. Read only: the administrator changes them."
      />
      <QueryView query={profiles} label="scoring profile">
        {(state) => {
          const active = state.profiles.find(
            (profile) => profile.id === state.cycleProfileId,
          );
          return active ? (
            <Profile profile={active} />
          ) : (
            <p>No scoring profile is applied.</p>
          );
        }}
      </QueryView>
      <QueryView
        query={forms}
        label="published forms"
        isEmpty={(list) => list.length === 0}
        empty="No form version has been published yet."
      >
        {(list) => (
          <div className="grid gap-6">
            {list.map((form) => (
              <Form key={form.id} form={form} periodLabel={periodLabel} />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
