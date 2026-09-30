import { cn } from '@/lib/utils';

/**
 * Plain-language definitions of the terms institution screens use (PRD §11). The summary
 * names the terms, so people who need it can find it without opening it.
 */
export function Glossary({ className }: { className?: string }) {
  return (
    <details
      className={cn(
        'rounded-lg border-2 border-base-lighter bg-white px-5 py-3 text-sm',
        className,
      )}
    >
      <summary className="min-h-touch cursor-pointer content-center font-bold">
        What CPC, IAO, CRAMP and baseline mean
      </summary>
      <dl className="mt-3 grid gap-2 tablet:grid-cols-[8rem_1fr]">
        <dt className="font-bold">CPC</dt>
        <dd className="text-base-dark">
          Corruption Prevention Committee: the institution's committee that
          oversees prevention work. Its signed quarterly minutes go with each
          report.
        </dd>
        <dt className="font-bold">IAO</dt>
        <dd className="text-base-dark">
          Integrity Assurance Officers: the officers who carry out integrity
          assurance. Their signed quarterly meeting minutes go with each report.
        </dd>
        <dt className="font-bold">CRAMP</dt>
        <dd className="text-base-dark">
          Corruption Risk Assessment and Mitigation Plan: your approved plan.
          Each quarter is scored against the milestones in its locked baseline.
        </dd>
        <dt className="font-bold">Baseline</dt>
        <dd className="text-base-dark">
          The milestones your officer approved for a quarter before it opened.
          They cannot be removed to improve a result.
        </dd>
      </dl>
    </details>
  );
}
