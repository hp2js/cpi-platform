import type { ScenarioResult } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, FastForward, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  advanceClock,
  refreshAfterClockChange,
  resetRun,
  runScenario,
  simulationQuery,
} from '@/features/simulation/queries';
import { formatDateTime } from '@/lib/dates';

function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SimulationPage() {
  const queryClient = useQueryClient();
  const simulation = useQuery(simulationQuery);
  const [log, setLog] = useState<ScenarioResult | null>(null);
  const after = () => refreshAfterClockChange(queryClient);
  const advance = useMutation({ mutationFn: advanceClock, onSuccess: after });
  const reset = useMutation({
    mutationFn: resetRun,
    onSuccess: async () => {
      setLog(null);
      await after();
    },
  });
  const scenario = useMutation({
    mutationFn: runScenario,
    onSuccess: async (result) => {
      setLog(result);
      await after();
    },
  });
  const error = advance.error ?? reset.error ?? scenario.error;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Simulation clock"
        description="Business time is simulated for the demonstration. Advancing runs the same deadline, reminder and overdue logic a scheduled worker would, once per boundary. Audit records keep actual time as well."
      />
      <Alert>
        <AlertTitle>Demonstration control</AlertTitle>
        <AlertDescription>
          All data is fictional. These actions affect only the current
          simulation run and never a live environment.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <QueryView query={simulation} label="simulation state">
        {(state) => {
          const next = state.boundaries.find((boundary) => !boundary.passed);
          return (
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
              <section
                aria-labelledby="run-heading"
                className="grid content-start gap-4 rounded-lg border bg-card p-5"
              >
                <h2 id="run-heading" className="font-semibold">
                  Run {state.runId}
                </h2>
                <dl className="grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">
                  <dt className="text-muted-foreground">Business time</dt>
                  <dd className="font-medium">
                    {formatDateTime(state.businessTime)}
                  </dd>
                  <dt className="text-muted-foreground">
                    Boundary events processed
                  </dt>
                  <dd>{state.processedEvents}</dd>
                  <dt className="text-muted-foreground">Next boundary</dt>
                  <dd>
                    {next
                      ? `${next.label}, ${formatDateTime(next.at)}`
                      : 'None: the cycle is complete'}
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {next && (
                    <Button
                      className="h-auto py-2 text-left whitespace-normal"
                      onClick={() => advance.mutate(next.id)}
                      disabled={advance.isPending}
                    >
                      <FastForward aria-hidden="true" />
                      Advance to {next.label}
                    </Button>
                  )}
                  <Confirm
                    trigger={
                      <Button variant="outline" disabled={scenario.isPending}>
                        <Play aria-hidden="true" />
                        {scenario.isPending
                          ? 'Running the scripted year…'
                          : 'Run the scripted year'}
                      </Button>
                    }
                    title="Run the scripted demonstration year?"
                    description="Institutions and officers act through the normal application services until the evaluation cutoff. Steps already done are skipped. Publication is left for you."
                    action="Run"
                    onConfirm={() => scenario.mutate()}
                  />
                  <Confirm
                    trigger={
                      <Button variant="ghost" disabled={reset.isPending}>
                        <RotateCcw aria-hidden="true" />
                        Start a new run
                      </Button>
                    }
                    title="Start a new simulation run?"
                    description="This restores the fictional starting fixtures in a new run. The current run's data is discarded."
                    action="Start new run"
                    onConfirm={() => reset.mutate()}
                  />
                </div>
                {log && (
                  <div className="grid gap-2">
                    <h3 className="text-sm font-semibold">
                      Scripted year: {log.steps.length} steps
                    </h3>
                    <ol className="max-h-80 overflow-y-auto rounded-md border bg-background p-3 text-xs">
                      {log.steps.map((step, index) => (
                        <li
                          key={index}
                          className="grid grid-cols-[10rem_1fr] gap-2 py-0.5"
                        >
                          <span className="text-muted-foreground">
                            {formatDateTime(step.at)}
                          </span>
                          <span>{step.summary}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
              <section
                aria-labelledby="timeline-heading"
                className="grid content-start gap-3 rounded-lg border bg-card p-5"
              >
                <h2 id="timeline-heading" className="font-semibold">
                  Cycle boundaries
                </h2>
                <ol className="grid gap-1 text-sm">
                  {state.boundaries.map((boundary) => (
                    <li
                      key={boundary.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-1.5 odd:bg-muted/40"
                    >
                      <span className="flex items-center gap-2">
                        {boundary.passed ? (
                          <CircleCheck
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={
                            boundary.passed ? 'text-muted-foreground' : ''
                          }
                        >
                          {boundary.label}
                          <span className="sr-only">
                            {boundary.passed ? ' (passed)' : ' (upcoming)'}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <time
                          dateTime={boundary.at}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDateTime(boundary.at)}
                        </time>
                        {!boundary.passed && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => advance.mutate(boundary.id)}
                            disabled={advance.isPending}
                          >
                            Go
                            <span className="sr-only">
                              {' '}
                              to {boundary.label}
                            </span>
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
