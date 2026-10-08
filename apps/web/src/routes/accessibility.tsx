import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/brand';
import { buttonVariants } from '@/components/ui/button';
import { SkipLink } from '@/layouts/shared';

/** Last reviewed: update with each audit or significant change to the checks. */
const REVIEWED = '8 October 2026';

/**
 * The accessibility statement (PRD §11, HP2-92): the conformance position, what is tested,
 * known limitations and how to report a problem. Public, so anyone can read it before signing in.
 */
export function AccessibilityPage() {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SkipLink />
      <header className="border-b bg-white px-6 py-4">
        <Brand />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-measure gap-6 px-6 py-10 outline-none"
      >
        <div>
          <Link
            to="/sign-in"
            search={{ redirect: undefined }}
            className={buttonVariants({ variant: 'plain', size: 'sm' })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to sign in
          </Link>
          <h1 className="mt-4 text-2xl font-bold">Accessibility statement</h1>
          <p className="mt-2 text-base-dark">
            For the corruption prevention reporting platform, a simulation with
            fictional institutions and data. Last reviewed {REVIEWED}.
          </p>
        </div>

        <section aria-labelledby="status-heading" className="grid gap-2">
          <h2 id="status-heading" className="text-lg font-bold">
            Conformance status
          </h2>
          <p>
            We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2
            at level AA. The platform is{' '}
            <strong>partially conformant</strong>: the checks below pass, but
            it has not yet been audited by an independent, qualified assessor
            or tested with people who use assistive technology. We do not claim
            full conformance until that audit is done and its findings are
            fixed.
          </p>
        </section>

        <section aria-labelledby="tested-heading" className="grid gap-2">
          <h2 id="tested-heading" className="text-lg font-bold">
            What we test, on every change
          </h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              Automated WCAG 2.0, 2.1 and 2.2 A and AA rules (axe) on about 30
              screens for all four roles, with no violations allowed.
            </li>
            <li>
              Keyboard use: every action reachable, visible focus, focus kept
              in dialogs and returned when they close.
            </li>
            <li>
              Phone width (390 pixels) without sideways scrolling, and larger
              text without lost content.
            </li>
            <li>
              Status is always given in words, never by colour alone; charts
              have the same values in text beside them.
            </li>
            <li>
              Recovery: expired sessions, failed uploads and conflicting saves
              keep what you entered and say what to do.
            </li>
            <li>
              Downloaded reports (PDF) have a real text layer, a title, the
              document language and tagged headings and tables.
            </li>
            <li>
              The core journeys run in Chromium, Firefox and WebKit (Safari's
              engine).
            </li>
          </ul>
        </section>

        <section aria-labelledby="known-heading" className="grid gap-2">
          <h2 id="known-heading" className="text-lg font-bold">
            Known limitations
          </h2>
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              No independent audit or testing with assistive-technology users
              yet; both are required before a pilot.
            </li>
            <li>
              Downloaded PDF reports are checked for their structure, but not
              yet read through with a screen reader.
            </li>
            <li>
              Uploaded evidence files are shown as provided; their own
              accessibility depends on the institution that made them.
            </li>
            <li>
              The interface is in English only. Kiswahili is planned.
            </li>
          </ul>
        </section>

        <section aria-labelledby="browsers-heading" className="grid gap-2">
          <h2 id="browsers-heading" className="text-lg font-bold">
            Supported browsers
          </h2>
          <p>
            The current versions of Chrome, Edge, Firefox and Safari, on
            desktop and on phones (Safari on iPhone, Chrome on Android).
          </p>
        </section>

        <section aria-labelledby="report-heading" className="grid gap-2">
          <h2 id="report-heading" className="text-lg font-bold">
            Report a problem
          </h2>
          <p>
            If something is hard to use, tell us what you were doing and what
            got in the way: email{' '}
            <a
              href="mailto:accessibility@adili.example"
              className="text-primary underline underline-offset-4"
            >
              accessibility@adili.example
            </a>{' '}
            (a demonstration address), or ask your administrator. We reply
            within five working days and record each report with a fix or a
            reason and a date.
          </p>
        </section>
      </main>
    </div>
  );
}
