import { CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface FieldProblem {
  /** DOM id of the control to focus. */
  target: string;
  message: string;
}

/**
 * USWDS/GOV.UK error summary: shown after a failed submit, above the form. It takes focus so
 * screen reader and keyboard users hear what went wrong, and each item moves focus to its
 * field. Remount it (change `key`) on every submit attempt to move focus again.
 */
export function ErrorSummary({ problems }: { problems: FieldProblem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = problems.length > 0;
  // Validation can fill in the problems just after the attempt starts; focus when they appear.
  useEffect(() => {
    if (shown) ref.current?.focus();
  }, [shown]);
  if (problems.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-heading"
      className="grid gap-2 border-l-8 border-error bg-error-lighter px-5 py-4 text-sm text-ink focus-visible:outline-4"
    >
      <h2
        id="error-summary-heading"
        className="flex items-center gap-2 text-md font-bold"
      >
        <CircleAlert className="size-6 shrink-0" aria-hidden="true" />
        There is a problem
      </h2>
      <ul className="grid gap-1 pl-8">
        {problems.map((problem) => (
          <li key={problem.target}>
            <a
              href={`#${problem.target}`}
              className="font-bold text-error-dark underline underline-offset-2"
              onClick={(event) => {
                const field = document.getElementById(problem.target);
                if (!field) return;
                event.preventDefault();
                field.scrollIntoView({ block: 'center' });
                field.focus({ preventScroll: true });
              }}
            >
              {problem.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
