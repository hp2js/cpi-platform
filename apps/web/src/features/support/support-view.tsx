import type { ReportBundle } from '@cpi/contracts';
import { useMutation } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useId, useState } from 'react';
import { WorkflowStateBadge } from '@/components/status';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { reportBundleSchema } from '@cpi/contracts';
import { request } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { FileViewer } from '@/features/files/file-viewer';

const openSupportView = (obligationId: string, reason: string) =>
  request(
    `/api/support/obligations/${encodeURIComponent(obligationId)}`,
    reportBundleSchema,
    { method: 'POST', json: { reason } },
  );

function answerText(value: unknown, fileName: (id: string) => string) {
  if (value === null || value === undefined || value === '')
    return 'Not answered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && 'evidenceIds' in value) {
    const answer = value as {
      evidenceIds: string[];
      unavailable: { explanation: string } | null;
    };
    if (answer.unavailable)
      return `Declared not available: ${answer.unavailable.explanation}`;
    return answer.evidenceIds.length
      ? answer.evidenceIds.map(fileName).join(', ')
      : 'Not answered';
  }
  return String(value);
}

/** The draft as the institution last saved it, read only. */
function DraftView({ bundle }: { bundle: ReportBundle }) {
  const draft = bundle.draft;
  const fileName = (id: string) =>
    bundle.evidence.find((item) => item.id === id)?.fileName ?? id;
  const files = bundle.evidence.filter((item) => item.supersededBy === null);
  if (!bundle.form)
    return <p className="text-sm">The report form has not been published.</p>;
  if (!draft)
    return (
      <p className="text-sm">
        No draft is saved. Submitted revisions are read from Reviews.
      </p>
    );
  return (
    <div className="grid gap-4 text-sm">
      <p className="text-muted-foreground">
        Draft version {draft.version}
        {draft.savedAt &&
          `, saved ${formatDateTime(draft.savedAt)}${draft.savedBy ? ` by ${draft.savedBy}` : ''}`}
        .
      </p>
      {bundle.form.sections.map((section) => (
        <section key={section.id} className="grid gap-2">
          <h3 className="font-semibold">{section.title}</h3>
          <dl className="grid gap-2">
            {section.questions.map((question) =>
              question.type === 'milestone_progress' ? (
                bundle.baseline.milestones.map((milestone) => {
                  const response = draft.answers.milestones[milestone.id];
                  return (
                    <div key={milestone.id} className="rounded-md border p-2">
                      <dt className="font-medium">
                        {milestone.code} {milestone.title}
                      </dt>
                      <dd>
                        {response?.completed === true
                          ? `Completed. ${response.output}`
                          : response?.completed === false
                            ? 'Not completed'
                            : 'Not answered'}
                        {response?.evidence.length
                          ? ` · Evidence: ${response.evidence.map((reference) => fileName(reference.evidenceId)).join(', ')}`
                          : ''}
                        {response?.evidenceUnavailable &&
                          ` · Evidence not available: ${response.evidenceUnavailable.explanation}`}
                      </dd>
                    </div>
                  );
                })
              ) : (
                <div key={question.id} className="rounded-md border p-2">
                  <dt className="font-medium">{question.label}</dt>
                  <dd>
                    {answerText(draft.answers.questions[question.id], fileName)}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>
      ))}
      <section className="grid gap-2">
        <h3 className="font-semibold">Files in the report</h3>
        {files.length ? (
          <ul className="grid gap-1">
            {files.map((item) => (
              <li key={item.id}>
                <FileViewer file={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No files are uploaded.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Opening a file is logged. Files stay available to you for 30 minutes
          after this support view.
        </p>
      </section>
    </div>
  );
}

/**
 * Read-only support access to an institution's report (PRD §5.2: "logged support access
 * only"). A reason is required, the view is audited, and the institution is told. There is no
 * way to edit or submit from here: submissions carry the institution's own attestation.
 */
export function SupportView({
  obligationId,
  periodLabel,
}: {
  obligationId: string;
  periodLabel: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const view = useMutation({
    mutationFn: () => openSupportView(obligationId, reason),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason('');
          view.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye aria-hidden="true" />
          Support view
          <span className="sr-only"> of the {periodLabel} report</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Support view: {periodLabel} report</DialogTitle>
          <DialogDescription>
            Read only. The view is recorded in the audit log and the institution
            is told, with your reason. You cannot change or submit the report
            for them.
          </DialogDescription>
        </DialogHeader>
        {view.data ? (
          <div className="grid gap-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <WorkflowStateBadge state={view.data.obligation.state} />
            </p>
            <DraftView bundle={view.data} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>Why do you need to see it?</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${id}-hint`}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              For example, the focal person reported a problem saving the
              milestones section. At least 20 characters.
            </p>
            {view.isError && (
              <Alert variant="destructive">
                <AlertDescription>{view.error.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {!view.data && (
            <Button
              disabled={reason.trim().length < 20 || view.isPending}
              onClick={() => view.mutate()}
            >
              Open read-only view
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
