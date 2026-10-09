import type { ReportIdentity } from '@cpi/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { reportImageUrl } from './queries';

/** The accent is an administrator's choice, checked for contrast on the server (HP2-65). */
const accent = (identity: ReportIdentity) =>
  ({ '--report-accent': identity.accentColor }) as CSSProperties;

/**
 * The report's cover block: the issuing organization, its logo, the report title and the
 * subject (the institution, or "Consolidated report"). The simulation marking is outside it,
 * in the page and the banner, so branding can never remove it.
 */
export function ReportCover({
  identity,
  cycleLabel,
  subject,
  children,
}: {
  identity: ReportIdentity;
  cycleLabel: string;
  /** The institution's ID and name, shown prominently, or the consolidated report's subject. */
  subject: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label="Report cover"
      style={accent(identity)}
      className="grid gap-3 rounded-lg border border-t-8 border-t-(--report-accent) bg-white p-5"
      data-print-keep
    >
      <div className="flex flex-wrap items-center gap-4">
        {identity.logo && (
          <img
            src={reportImageUrl(identity.logo.id)}
            alt={`${identity.organizationName} logo`}
            width={identity.logo.width}
            height={identity.logo.height}
            className="h-14 w-auto max-w-48 object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold">{identity.organizationName}</p>
          <p className="text-lg leading-tight font-bold text-(--report-accent)">
            {identity.reportTitle} · {cycleLabel}
          </p>
        </div>
      </div>
      <div className="text-lg font-bold">{subject}</div>
      {identity.foreword && (
        <p className="max-w-measure text-sm whitespace-pre-line text-base-dark">
          {identity.foreword}
        </p>
      )}
      {children}
    </section>
  );
}

/** Signatory, contact and footer line, after the report's content. */
export function ReportSignoff({ identity }: { identity: ReportIdentity }) {
  return (
    <footer
      style={accent(identity)}
      className="grid gap-3 border-t-2 border-t-(--report-accent) pt-4 text-sm"
      data-print-keep
    >
      {identity.signatory && (
        <div className="grid gap-1">
          {identity.signature && (
            <img
              src={reportImageUrl(identity.signature.id)}
              alt={`Signature of ${identity.signatory.name}`}
              width={identity.signature.width}
              height={identity.signature.height}
              className="h-12 w-auto max-w-56 object-contain"
            />
          )}
          <p className="font-bold">{identity.signatory.name}</p>
          <p className="text-base-dark">
            {identity.signatory.title}, {identity.organizationName}
          </p>
        </div>
      )}
      {identity.contact && (
        <p>
          <span className="text-base-dark">Contact: </span>
          {identity.contact}
        </p>
      )}
      {identity.footer && (
        <p className="text-xs text-base-dark">{identity.footer}</p>
      )}
    </footer>
  );
}
