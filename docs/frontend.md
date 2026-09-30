# Frontend contribution guide

## Entry points

`src/main.tsx` starts the development service worker (fault injection, or the whole mock with `VITE_API_MODE=mock`), then renders one QueryClient and one router. `src/app/router.tsx` defines typed code-based routes: public pages (sign-in, forgot password, set password from an emailed link, forbidden, session expired) and one guarded subtree per role, each with its own layout in `src/layouts/`. Screens live in `src/routes/<role>/`; domain queries and components live in `src/features/<domain>/`; shared domain components (status badges, page header, query states) in `src/components/`; generated shadcn primitives stay in `src/components/ui`. [frontend-plan.md](frontend-plan.md) describes the full screen inventory and delivery phases.

Route guards only improve navigation. The API is the authority: every screen must handle 401, 403 and 404 responses, and `src/app/query-client.ts` sends the user to the session-expired or sign-in page when any request reports the session is gone.

## Server data: TanStack Query

Use `src/lib/api.ts` for same-origin `/api` requests. It supports cancellation, a five-second timeout, non-JSON gateway errors and field-validation errors. Zod schemas and TypeScript types live in `@cpi/contracts`; `request(path, schema)` validates every response against them. Contracts under `packages/contracts/src/draft/` are the frontend's proposal for HP2-9, implemented today by the mock API. Model pending states explicitly (e.g. `{ status: 'pending', reason }`), never as a nullable number.

Put query keys/options beside each feature. Include every filter, institution identifier and reporting period that affects the response in its query key. Render pending, error, empty and success states. Preserve usable data during background refreshes. Do not put fetched entities in a second global store.

After a successful mutation, invalidate the specific affected query family with `queryClient.invalidateQueries({ queryKey: [...] })`; only report success once the server confirms it. The health refresh button is a working invalidation example. Do not retry writes by default. Clear institution-scoped cached data when identity or access context changes once authentication exists.

## Real API and mock API

Development runs against the real API (`apps/api`). The in-browser [MSW](https://mswjs.io/) mock in `src/mocks/` remains for component tests and as a reference: `db.ts` holds the seeded fictional cycle, `services/` the rules, and `handlers/` the REST routes. The same handlers run in Vitest (`src/test-setup.ts`), so component tests exercise the contract without a server.

- `VITE_API_MODE=mock` runs the mock in the browser instead of the real API (development only). Production builds never include MSW: its worker lives in `dev-public/`, which Vite serves only in development. Regenerate it after upgrading msw with `pnpm --filter @cpi/web exec msw init dev-public --no-save`.
- In development the worker also injects network faults (`/api/__mock/fault`) for recovery rehearsals; against the real API it handles nothing else. The API serves the other development controls (`/api/__mock/reset`, `email-failure`, `expire-session`) on the same paths, outside production only, so the toolbar and e2e specs work in either mode.
- The mock behaves like a server: it resolves the session, enforces role and assignment scope (out-of-scope reads return 404), and derives deadline flags from simulated business time. Keep business rules in `src/mocks/services/`, never in components.
- The **Dev controls** button (**Mock API** in mock mode; development only) expires the session, fails email delivery and resets demo data, for exercising loading and recovery states; in mock mode it also changes latency.
- **Scripted year:** the administrator's Simulation clock page runs `src/mocks/scenario.ts`, which plays PRD §17.1 for all eight institutions by calling the mock API as each real account (so scope, workflow and audit rules apply), skipping steps already done. From a fresh run it reproduces the expected annual results (88.75, 70.00, 96.25 …), asserted in `src/mocks/annual.test.ts`; the real API runs the same script server-side (`apps/api/src/simulation/scenario.ts`), asserted in its integration tests.
- The clock only moves forward; each boundary (reporting opens, reminders, deadline, overdue, cutoff, publication) is processed once per run. Start a new run to go back.

## Navigation and lists: Router + Table

The pinned TanStack Table v9 API uses `useTable` and explicit `tableFeatures` (filtering, sorting and visibility). Register row model factories on the feature definition; do not copy v8 `useReactTable` examples.

Hold filters, sort order, tabs and selected revisions in validated route search params, so refreshes and shared URLs preserve the view. Use replace navigation while typing to avoid a browser-history entry per keystroke. Sortable headers must be keyboard operable with `aria-sort` and a visible direction indicator.

Use Table for column/row behaviour and shadcn's semantic table elements for rendering. Small fixtures are filtered locally. When real lists use server pagination, put page/filter/sort in route search and query keys, and use Table's manual pagination/sorting/filtering options. Do not apply client-side filtering to only one server page.

## Forms: TanStack Form

For a real write, validate at the server and use Query's mutation state. The agreed error envelope is `{ message, fieldErrors?: Record<string, string> }`; `ApiError` preserves it. Once backend validation is introduced, map only known field names to TanStack Form's `form.setFieldMeta(name, previous => ({ ...previous, errorMap: { ...previous.errorMap, onSubmit: message } }))`, show unknown/global errors in an alert, and clear stale server errors when that field changes. Give each error an ID referenced by the input's `aria-describedby`, set `aria-invalid`, and focus the first invalid field. Disable duplicate submits while pending; preserve user input after errors. Add endpoint-specific integration tests when the endpoint exists.

## Styling and components

Tailwind v4 uses the Vite plugin and CSS-first configuration. The canonical specification is
[design-system/MASTER.md](../design-system/MASTER.md); runtime tokens live in `src/styles.css`.
The theme is the USWDS 3 foundation (type scale, spacing, radii, form and alert patterns,
state colours, focus) dressed in the Adili palette: purple primary, gold accent, purple-tinted
neutrals, the Adili destructive red and a tinted `canvas` page background behind white
surfaces. Token names stay USWDS's, so a palette change never touches component classes.
Use semantic classes such as `bg-primary`, `text-ink` and `text-base-dark`. Tailwind's default
colours, font sizes, breakpoints, radii and shadows are reset; old shadcn theme names such as
`text-muted-foreground` have no CSS.

Local components originated from shadcn and now follow the project's USWDS adaptation. Keep
Radix behavior for dialogs, selects, menus and focus management. Do not install USWDS JavaScript
alongside Radix or overwrite these wrappers with generated defaults. New components should
reuse the patterns and tokens in MASTER; declare and pin any new dependency in this workspace.

Use `cn` from `@/lib/utils` when accepting class overrides. Its merge configuration understands
our custom container widths and distinguishes `text-base` (colour) from font-size classes.
Dialog and alert-dialog wrappers handle viewport limits, scrolling, wrapping and footer order.
Use a width override for wider content; do not repeat overflow fixes in screens. Drawers and
popovers also constrain themselves to the viewport. Preserve title/description associations,
focus trapping, Escape and focus restoration when adapting them.

- **Confirmations.** An `AlertDialogAction` that deletes, discards or replaces work takes
  `variant="destructive"` (Adili red); every other confirmation keeps the primary style, and
  the safe choice is always the `AlertDialogCancel` beside it.
- **Drawers on dark surfaces.** The sheet's close control uses the current text colour, so a
  drawer that sets `bg-primary text-white` (the admin navigation) keeps it visible.
- **Side-by-side fields.** Fields in a two-column row share their rows with CSS subgrid
  (`Field aligned` in `features/planning/plan-editor.tsx`), so controls line up even when only
  one field has a hint or an error. The parent grid sets the columns and `gap-y-2`.
- **Inputs inside popovers** (the combobox search) carry `data-focus-inset`, which draws the
  4 px focus outline inside the field where the popover edge cannot clip it.
- **Layouts.** Pages sit on `bg-canvas`; headers, navigation, cards, tables and dialogs are
  white. The admin console keeps its Adili purple sidebar; the other roles use a white side
  navigation. Below `desktop`, every header shows the wordmark beside the menu button.

## Selects, long lists and fixed chrome

- **Choosing a control.** Use `SelectField` (`components/select-field.tsx`, built on Radix Select) for short, fixed lists such as a quarter, role, category or institution type; there are no native `<select>` elements. Use `Combobox` (`components/combobox.tsx`) for lists that grow with the number of institutions or users: institutions, officers. It is a button labelled by its `<Label htmlFor>`, with a popup that follows the WAI-ARIA combobox-with-listbox pattern and renders at most 100 matches while you type.
- **Long lists.** Anything sized by institutions (up to 500+) uses `useListControls` with `ListSearch` and `ListPager` from `components/list-controls.tsx`: filter by typed words, 20–50 rows a page. A printable list pages on screen and uses `usePrinting()` so the printed copy is complete.
- **Fixed chrome.** Layouts pin the simulation banner, header and desktop sidebar with `sticky`. `useMeasuredHeight` writes their heights to `--banner-h` and `--header-h`; in-page sticky bars use `top-(--sticky-top)`, and `scroll-padding-top` keeps anchors and focused fields clear of the header. Mark sticky elements with `data-sticky` so print resets them.

## Adili palette source

The brand colours and their provenance are documented once in
[MASTER's colour section](../design-system/MASTER.md#colour). They are the values of the Adili
theme the app used before the USWDS migration (`apps/web/src/styles.css` at `09078d5^`),
recovered onto USWDS token names: purple for primary actions, gold for restrained accents with
dark text, purple-tinted neutrals for text, borders and surfaces, and the Adili red for
destructive actions. Validation and status keep their USWDS state colours, and focus stays
USWDS blue. `src/design-tokens.test.ts` reads `styles.css` and fails if any text/surface pair
drops below 4.5:1. No EACC logo or official endorsement is reproduced.

Keep text contrast, visible focus, labels, keyboard access, semantic headings and textual status indicators. Do not communicate validation or readiness using colour alone. Verify changes at narrow/mobile widths and with keyboard-only use.

## Scope and handoff

All data is fictional (PRD §17.1). The frontend never computes an authoritative score, deadline or state transition; it renders what the API returns, with provisional, reviewed and published values always labelled and pending never shown as zero. See [frontend-plan.md](frontend-plan.md) for the principles each screen is checked against, [frontend-verification.md](frontend-verification.md) for what has been verified and what has not, and [api-handover.md](api-handover.md) for the endpoints and rules the real API must provide, and [prd-coverage.md](prd-coverage.md) for how each PRD requirement and scenario is met.
