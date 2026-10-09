import {
  assistantChatSchema,
  assistantKindLabels,
  assistantViewSchema,
  type AssistantDecisionRequest,
  type AssistantRun,
  type AssistantSuggestion,
  type EvidenceItem,
} from '@cpi/contracts';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MessagesSquare, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileViewer, type ViewableFile } from '@/features/files/file-viewer';
import { isApiError, request } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

/*
 * The evidence assistant (PRD §14) beside a file's suitability checks. It reads each file when
 * the report is submitted (the assigned officer can ask again after a failure); every suggestion
 * is labelled AI-generated, points to its passage and is accepted, amended or dismissed on its
 * own. `AssistantChat` lets the officer ask about the whole submission. Nothing here records a
 * check or decision.
 */

const base = (submissionId: string, evidenceId: string) =>
  `/api/reviews/${encodeURIComponent(submissionId)}/evidence/${encodeURIComponent(evidenceId)}/assistant` as const;

export const assistantQuery = (submissionId: string, evidenceId: string) =>
  queryOptions({
    queryKey: ['reviews', submissionId, 'assistant', evidenceId] as const,
    queryFn: ({ signal }) =>
      request(base(submissionId, evidenceId), assistantViewSchema, { signal }),
    // Poll only while a run is in progress; the officer keeps reviewing meanwhile.
    refetchInterval: (query) =>
      query.state.data?.runs[0]?.status === 'running' ? 2000 : false,
  });

const outcomeLabel = {
  accepted: 'Accepted',
  amended: 'Amended',
  dismissed: 'Dismissed',
} as const;

function Suggestion({
  submissionId,
  evidenceId,
  file,
  run,
  suggestion,
  canDecide,
}: {
  submissionId: string;
  /** The file the panel belongs to, whose query holds this run. */
  evidenceId: string;
  /** The exact version the suggestion was made from. */
  file: ViewableFile;
  run: AssistantRun;
  suggestion: AssistantSuggestion;
  canDecide: boolean;
}) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [amending, setAmending] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const decide = useMutation({
    mutationFn: (body: AssistantDecisionRequest) =>
      request(
        `/api/reviews/${encodeURIComponent(submissionId)}/assistant/suggestions/${encodeURIComponent(suggestion.id)}`,
        assistantViewSchema,
        { method: 'PUT', json: body },
      ),
    onSuccess: (view) => {
      queryClient.setQueryData(
        assistantQuery(submissionId, evidenceId).queryKey,
        view,
      );
      setChanging(false);
      setAmending(false);
    },
  });
  const decision = suggestion.decision;
  const where =
    suggestion.page === null
      ? null
      : `${run.unit === 'sheet' ? 'sheet' : 'page'} ${suggestion.page}`;
  return (
    <li className="grid gap-2 rounded-md border border-base-lighter p-3 text-sm">
      <p className="text-xs font-bold text-base-dark">
        {assistantKindLabels[suggestion.kind]}
        {suggestion.milestoneCode && ` · ${suggestion.milestoneCode}`}
      </p>
      <p>{suggestion.statement}</p>
      {suggestion.quote && (
        <blockquote className="border-l-4 border-base-light pl-3 text-base-dark">
          “{suggestion.quote}”
        </blockquote>
      )}
      <p className="text-xs text-base-dark">
        {where ? (
          <>
            Based on {where}:{' '}
            <FileViewer
              file={file}
              page={suggestion.page ?? undefined}
              label={`Open the file at ${where}`}
              className="font-normal"
            />
          </>
        ) : suggestion.quote ? (
          'Based on the passage above.'
        ) : (
          'Based on a check of all the readable text in the file.'
        )}
      </p>

      {decision && !changing ? (
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{outcomeLabel[decision.outcome]}</Badge>
          <span className="text-base-dark">
            by {decision.by}, {formatDateTime(decision.at)}
          </span>
          {decision.note && (
            <span className="basis-full">
              Officer's wording: {decision.note}
            </span>
          )}
          {canDecide && (
            <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
              Change
              <span className="sr-only"> the decision on this suggestion</span>
            </Button>
          )}
        </p>
      ) : (
        canDecide && (
          <div className="grid gap-2">
            {!amending ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ outcome: 'accepted' })}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => {
                    setNote(suggestion.statement);
                    setAmending(true);
                  }}
                >
                  Amend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ outcome: 'dismissed' })}
                >
                  Dismiss
                </Button>
              </div>
            ) : (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  decide.mutate({ outcome: 'amended', note });
                }}
              >
                <Label htmlFor={noteId}>Your wording</Label>
                <Textarea
                  id={noteId}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  aria-describedby={
                    isApiError(decide.error) ? `${noteId}-error` : undefined
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={decide.isPending}>
                    Save amended suggestion
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAmending(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {decide.isError && (
              <p
                id={`${noteId}-error`}
                role="alert"
                className="font-bold text-error-dark"
              >
                {isApiError(decide.error)
                  ? (decide.error.fieldErrors.note ?? decide.error.message)
                  : 'The decision was not saved. Try again.'}
              </p>
            )}
          </div>
        )
      )}
    </li>
  );
}

function Run({
  submissionId,
  item,
  run,
  canDecide,
}: {
  submissionId: string;
  item: EvidenceItem;
  run: AssistantRun;
  canDecide: boolean;
}) {
  const unit = run.unit === 'sheet' ? 'Sheet' : 'Page';
  const notes = [
    run.unreadablePages.length > 0 &&
      `${unit}${run.unreadablePages.length > 1 ? 's' : ''} ${run.unreadablePages.join(', ')} could not be read, for example a scan or photo without text. Nothing was guessed about ${run.unreadablePages.length > 1 ? 'them' : 'it'}; review ${run.unreadablePages.length > 1 ? 'them' : 'it'} directly.`,
    run.discarded.instructionLike > 0 &&
      `This file contains ${run.discarded.instructionLike} passage${run.discarded.instructionLike > 1 ? 's' : ''} that read${run.discarded.instructionLike > 1 ? '' : 's'} like instructions to an automated reviewer. ${run.discarded.instructionLike > 1 ? 'They were' : 'It was'} treated as document text and ignored.`,
    run.discarded.untraceable > 0 &&
      `${run.discarded.untraceable} suggestion${run.discarded.untraceable > 1 ? 's' : ''} could not be traced to the file and ${run.discarded.untraceable > 1 ? 'were' : 'was'} not shown.`,
    run.language !== 'en' &&
      run.language !== null &&
      run.hiddenKinds.length > 0 &&
      'The evidence assistant is less reliable for documents in this language, so some suggestions are not shown.',
  ].filter(Boolean) as string[];
  return (
    <div className="grid gap-2">
      {notes.map((note) => (
        <p key={note} className="bg-info-lighter px-3 py-2 text-xs">
          {note}
        </p>
      ))}
      {run.suggestions.length ? (
        <ul className="grid gap-2">
          {run.suggestions.map((suggestion) => (
            <Suggestion
              key={suggestion.id}
              submissionId={submissionId}
              evidenceId={item.id}
              file={
                run.evidenceId === item.id
                  ? item
                  : {
                      id: run.evidenceId,
                      fileName: item.fileName,
                      version: run.evidenceVersion,
                    }
              }
              run={run}
              suggestion={suggestion}
              canDecide={canDecide}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-base-dark">No suggestions for this file.</p>
      )}
    </div>
  );
}

function RunDetails({ run }: { run: AssistantRun }) {
  return (
    <p className="text-xs text-base-dark">
      Version {run.evidenceVersion} of the file · {run.provider}, {run.model},
      prompt {run.promptRevision} · asked by {run.requestedBy},{' '}
      {formatDateTime(run.requestedAt)}
      {run.durationMs !== null && ` · ${(run.durationMs / 1000).toFixed(1)} s`}
    </p>
  );
}

export function AssistantPanel({
  submissionId,
  item,
}: {
  submissionId: string;
  item: EvidenceItem;
}) {
  const queryClient = useQueryClient();
  const query = useQuery(assistantQuery(submissionId, item.id));
  const ask = useMutation({
    mutationFn: () =>
      request(`${base(submissionId, item.id)}/runs`, assistantViewSchema, {
        method: 'POST',
      }),
    onSuccess: (view) =>
      queryClient.setQueryData(
        assistantQuery(submissionId, item.id).queryKey,
        view,
      ),
  });
  const headingId = `assistant-${item.id}`;
  const view = query.data;
  if (!view) return null;
  const current = view.runs.filter((run) => run.evidenceId === item.id);
  const [latest] = current;
  const history = view.runs.filter((run) => run !== latest);
  const canAsk =
    view.canRun && (!latest || latest.status === 'failed') && !ask.isPending;

  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 border-t border-base-lighter pt-3"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="size-4" aria-hidden="true" />
        Evidence assistant
        <span className="sr-only"> for {item.fileName}</span>
      </h3>
      <p className="text-xs text-base-dark">
        AI-generated suggestions. Check each one against the file. They never
        record a suitability check, a decision or a score.
      </p>
      {!view.enabled && <AssistantOff />}

      {latest?.status === 'running' && (
        <p role="status" className="text-sm">
          Reading the file. You can carry on reviewing; this stops by itself if
          it takes too long.
        </p>
      )}
      {(latest?.status === 'failed' || latest?.status === 'declined') && (
        <p role="alert" className="text-sm font-bold">
          {latest.message}
        </p>
      )}
      {ask.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
          {isApiError(ask.error)
            ? ask.error.message
            : 'The evidence assistant could not be asked. Try again.'}
        </p>
      )}
      {canAsk && (
        <div>
          <Button size="sm" variant="outline" onClick={() => ask.mutate()}>
            {latest ? 'Ask again' : 'Ask the evidence assistant'}
            <span className="sr-only"> about {item.fileName}</span>
          </Button>
        </div>
      )}
      {latest?.status === 'completed' && (
        <Run
          submissionId={submissionId}
          item={item}
          run={latest}
          canDecide={view.canDecide}
        />
      )}
      {latest && <RunDetails run={latest} />}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">
            Earlier suggestions ({history.length})
          </summary>
          <div className="mt-2 grid gap-4">
            {history.map((run) => (
              <div key={run.id} className="grid gap-2">
                <RunDetails run={run} />
                {run.status === 'completed' ? (
                  <Run
                    submissionId={submissionId}
                    item={item}
                    run={run}
                    canDecide={false}
                  />
                ) : (
                  <p className="text-base-dark">{run.message}</p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** Shown instead of the assistant's actions while it is off; the review works as usual. */
function AssistantOff() {
  return (
    <p className="bg-base-lightest px-3 py-2 text-sm">
      The evidence assistant is turned off. An administrator can turn it on
      under Operations → Evidence assistant.
    </p>
  );
}

const chatPath = (submissionId: string) =>
  `/api/reviews/${encodeURIComponent(submissionId)}/assistant/chat` as const;

export const assistantChatQuery = (submissionId: string) =>
  queryOptions({
    queryKey: ['reviews', submissionId, 'assistant-chat'] as const,
    queryFn: ({ signal }) =>
      request(chatPath(submissionId), assistantChatSchema, { signal }),
  });

/** The officer's questions about the whole submission, answered from its files. */
export function AssistantChat({ submissionId }: { submissionId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(assistantChatQuery(submissionId));
  const [question, setQuestion] = useState('');
  const questionId = useId();
  const ask = useMutation({
    mutationFn: (text: string) =>
      request(chatPath(submissionId), assistantChatSchema, {
        method: 'POST',
        json: { question: text },
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData(assistantChatQuery(submissionId).queryKey, chat);
      setQuestion('');
    },
  });
  const chat = query.data;
  if (!chat) return null;
  const error = ask.isError
    ? isApiError(ask.error)
      ? (ask.error.fieldErrors.question ?? ask.error.message)
      : 'The question was not sent. Try again.'
    : null;

  return (
    <section aria-labelledby="assistant-chat-heading" className="grid gap-3">
      <h2
        id="assistant-chat-heading"
        className="flex items-center gap-2 text-lg font-bold"
      >
        <MessagesSquare className="size-5" aria-hidden="true" />
        Ask the evidence assistant
      </h2>
      <p className="text-xs text-base-dark">
        AI-generated answers from this submission's files. Check each answer
        against the files. They never record a suitability check, a decision or
        a score.
      </p>
      {!chat.enabled && <AssistantOff />}
      {chat.messages.length > 0 && (
        <ol aria-label="Conversation" className="grid gap-2">
          {chat.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.role === 'officer'
                  ? 'grid gap-1 rounded-md bg-base-lightest p-3 text-sm'
                  : 'grid gap-1 rounded-md border border-base-lighter p-3 text-sm'
              }
            >
              <p className="text-xs font-bold text-base-dark">
                {message.role === 'officer'
                  ? message.by
                  : 'Evidence assistant (AI-generated)'}
                {' · '}
                {formatDateTime(message.at)}
              </p>
              <p className="break-words whitespace-pre-wrap">{message.text}</p>
            </li>
          ))}
        </ol>
      )}
      {ask.isPending && (
        <p role="status" className="text-sm">
          Reading the files to answer. This stops by itself if it takes too
          long.
        </p>
      )}
      {chat.canAsk && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask.mutate(question);
          }}
        >
          <Label htmlFor={questionId}>
            Your question about this submission
          </Label>
          <Textarea
            id={questionId}
            value={question}
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            aria-describedby={error ? `${questionId}-error` : undefined}
          />
          {error && (
            <p
              id={`${questionId}-error`}
              role="alert"
              className="font-bold text-error-dark"
            >
              {error}
            </p>
          )}
          <div>
            <Button
              type="submit"
              size="sm"
              disabled={ask.isPending || question.trim().length < 2}
            >
              Ask
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
