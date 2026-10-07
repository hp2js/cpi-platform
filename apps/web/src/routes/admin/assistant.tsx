import {
  assistantKindLabels,
  assistantSettingsSchema,
  type AssistantKind,
} from '@cpi/contracts';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api';

const settingsQuery = queryOptions({
  queryKey: ['admin', 'assistant'] as const,
  queryFn: ({ signal }) =>
    request('/api/admin/assistant', assistantSettingsSchema, { signal }),
});

const kinds = (list: AssistantKind[]) =>
  list.length
    ? list.map((kind) => assistantKindLabels[kind]).join(', ')
    : 'None';

/** Evidence assistant settings (PRD §14): on or off, the active provider, limits and usage. */
export function AssistantSettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(settingsQuery);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      request('/api/admin/assistant', assistantSettingsSchema, {
        method: 'PUT',
        json: { enabled },
      }),
    onSuccess: (settings) =>
      queryClient.setQueryData(settingsQuery.queryKey, settings),
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Evidence assistant"
        description="An optional aid for prevention officers. On request, it suggests facts from one evidence file, each tied to a passage in the file. Officers accept, amend or dismiss every suggestion. It never records a check, a decision or a score, and institutions never see it."
      />
      {toggle.isError && (
        <Alert variant="destructive">
          <AlertDescription>{toggle.error.message}</AlertDescription>
        </Alert>
      )}
      <QueryView query={query} label="evidence assistant settings">
        {(settings) => (
          <div className="grid gap-6">
            <section
              aria-labelledby="assistant-status"
              className="grid gap-4 rounded-lg border bg-white p-5"
            >
              <h2 id="assistant-status" className="font-bold">
                The evidence assistant is {settings.enabled ? 'on' : 'off'}
              </h2>
              {settings.unavailableReason && (
                <p className="text-sm font-bold">
                  It cannot be turned on: {settings.unavailableReason}
                </p>
              )}
              <div>
                <Button
                  variant={settings.enabled ? 'outline' : 'default'}
                  disabled={
                    toggle.isPending ||
                    (!settings.enabled && !settings.available)
                  }
                  onClick={() => toggle.mutate(!settings.enabled)}
                >
                  {settings.enabled ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
              <dl className="grid gap-1 text-sm tablet:grid-cols-[14rem_1fr]">
                <dt className="text-base-dark">Provider</dt>
                <dd>{settings.provider}</dd>
                <dt className="text-base-dark">Model</dt>
                <dd>{settings.model}</dd>
                <dt className="text-base-dark">Where files are sent</dt>
                <dd>
                  {settings.endpoint === 'in-process'
                    ? 'Nowhere: rules run inside the platform'
                    : settings.endpoint}
                </dd>
                <dt className="text-base-dark">Data handling record</dt>
                <dd>
                  {settings.termsRef ?? 'Not needed for in-platform rules'}
                </dd>
                <dt className="text-base-dark">Prompt revision</dt>
                <dd>{settings.promptRevision}</dd>
                <dt className="text-base-dark">Page limit</dt>
                <dd>{settings.maxPages} pages</dd>
                <dt className="text-base-dark">Time limit per file</dt>
                <dd>{Math.round(settings.timeoutMs / 1000)} seconds</dd>
                <dt className="text-base-dark">
                  Hidden (below the accuracy bar)
                </dt>
                <dd>{kinds(settings.hiddenKinds)}</dd>
                <dt className="text-base-dark">
                  Shown for Kiswahili and mixed documents
                </dt>
                <dd>{kinds(settings.otherLanguageKinds)}</dd>
              </dl>
              <p className="text-sm text-base-dark">
                The provider, model and limits are deployment configuration (see
                docs/assistant.md), so they change without code changes.
              </p>
            </section>
            <section
              aria-labelledby="assistant-usage"
              className="grid gap-3 rounded-lg border bg-white p-5"
            >
              <h2 id="assistant-usage" className="font-bold">
                Usage
              </h2>
              <dl className="grid gap-1 text-sm tablet:grid-cols-[14rem_1fr]">
                <dt className="text-base-dark">Requests</dt>
                <dd>
                  {settings.usage.runs} ({settings.usage.completed} completed,{' '}
                  {settings.usage.declined} declined, {settings.usage.failed}{' '}
                  failed)
                </dd>
                <dt className="text-base-dark">Suggestions shown</dt>
                <dd>{settings.usage.suggestions}</dd>
                <dt className="text-base-dark">Officers' decisions</dt>
                <dd>
                  {settings.usage.accepted} accepted, {settings.usage.amended}{' '}
                  amended, {settings.usage.dismissed} dismissed
                </dd>
                <dt className="text-base-dark">Untraceable, never shown</dt>
                <dd>{settings.usage.discarded}</dd>
              </dl>
            </section>
          </div>
        )}
      </QueryView>
    </div>
  );
}
