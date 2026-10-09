import type { ReactNode } from 'react';

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  screenOnlyDescription = false,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** The description is on-screen guidance only and is left out of printouts. */
  screenOnlyDescription?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-base-lighter pb-6 tablet:flex-row tablet:items-end tablet:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-bold text-primary">{eyebrow}</p>}
        <h1 className="mt-1 text-xl font-bold text-balance">{title}</h1>
        {description && (
          <div
            data-print-hide={screenOnlyDescription || undefined}
            className="mt-2 max-w-measure text-sm text-base-dark"
          >
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div data-print-hide className="flex shrink-0 flex-wrap gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
