import type { ReactNode } from 'react';

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <div className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
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
