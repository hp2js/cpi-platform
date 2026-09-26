# Frontend contribution guide

## Entry points

`src/main.tsx` starts the mock API (development only), then renders one QueryClient and one router. `src/app/router.tsx` defines typed code-based routes: public pages (sign-in, forbidden, session expired) and one guarded subtree per role, each with its own layout in `src/layouts/`. Screens live in `src/routes/<role>/`; domain queries and components live in `src/features/<domain>/`; shared domain components (status badges, page header, query states) in `src/components/`; generated shadcn primitives stay in `src/components/ui`. [frontend-plan.md](frontend-plan.md) describes the full screen inventory and delivery phases.

Route guards only improve navigation. The API is the authority: every screen must handle 401, 403 and 404 responses, and `src/app/query-client.ts` sends the user to the session-expired or sign-in page when any request reports the session is gone.

## Server data: TanStack Query

Use `src/lib/api.ts` for same-origin `/api` requests. It supports cancellation, a five-second timeout, non-JSON gateway errors and field-validation errors. Zod schemas and TypeScript types live in `@cpi/contracts`; `request(path, schema)` validates every response against them. Contracts under `packages/contracts/src/draft/` are the frontend's proposal for HP2-9, implemented today by the mock API. Model pending states explicitly (e.g. `{ status: 'pending', reason }`), never as a nullable number.

Put query keys/options beside each feature. Include every filter, institution identifier and reporting period that affects the response in its query key. Render pending, error, empty and success states. Preserve usable data during background refreshes. Do not put fetched entities in a second global store.

After a successful mutation, invalidate the specific affected query family with `queryClient.invalidateQueries({ queryKey: [...] })`; only report success once the server confirms it. The health refresh button is a working invalidation example. Do not retry writes by default. Clear institution-scoped cached data when identity or access context changes once authentication exists.

## Mock API

Until the backend implements a contract, `pnpm dev` serves it from [MSW](https://mswjs.io/) in `src/mocks/`: `db.ts` holds the seeded fictional cycle (persisted to localStorage), `services/` holds scope checks, business-time rules and (later) scoring, and `handlers/` maps REST routes to them. Unhandled requests, such as `/api/health`, pass through to the real API. The same handlers run in Vitest (`src/test-setup.ts`), so component tests exercise the contract too.

- Set `VITE_API_MODE=live` to bypass the mock in development. Production builds never include MSW: its worker lives in `dev-public/`, which Vite serves only in development. Regenerate it after upgrading msw with `pnpm --filter @cpi/web exec msw init dev-public --no-save`.
- The mock behaves like a server: it resolves the session, enforces role and assignment scope (out-of-scope reads return 404), and derives deadline flags from simulated business time. Keep business rules in `src/mocks/services/`, never in components.
- The **Mock API** button (development only) changes latency, expires the session and resets demo data, for exercising loading and recovery states.
- When a real endpoint lands, delete its handler; the screens should not change.

## Navigation and lists: Router + Table

The pinned TanStack Table v9 API uses `useTable` and explicit `tableFeatures` (filtering, sorting and visibility). Register row model factories on the feature definition; do not copy v8 `useReactTable` examples.

Hold filters, sort order, tabs and selected revisions in validated route search params, so refreshes and shared URLs preserve the view. Use replace navigation while typing to avoid a browser-history entry per keystroke. Sortable headers must be keyboard operable with `aria-sort` and a visible direction indicator.

Use Table for column/row behaviour and shadcn's semantic table elements for rendering. Small fixtures are filtered locally. When real lists use server pagination, put page/filter/sort in route search and query keys, and use Table's manual pagination/sorting/filtering options. Do not apply client-side filtering to only one server page.

## Forms: TanStack Form

For a real write, validate at the server and use Query's mutation state. The agreed error envelope is `{ message, fieldErrors?: Record<string, string> }`; `ApiError` preserves it. Once backend validation is introduced, map only known field names to TanStack Form's `form.setFieldMeta(name, previous => ({ ...previous, errorMap: { ...previous.errorMap, onSubmit: message } }))`, show unknown/global errors in an alert, and clear stale server errors when that field changes. Give each error an ID referenced by the input's `aria-describedby`, set `aria-invalid`, and focus the first invalid field. Disable duplicate submits while pending; preserve user input after errors. Add endpoint-specific integration tests when the endpoint exists.

## Styling and components

Tailwind v4 uses the Vite plugin and CSS-first configuration. Semantic theme tokens live only in `src/styles.css`; use `bg-primary`, `text-muted-foreground`, etc. rather than repeating hex colours in screens. Components were generated from the official shadcn/ui registry (new-york style) and are editable local code.

Add primitives from the repo root:

```sh
pnpm dlx shadcn@4.21.0 add <component> -c apps/web
```

Review generated changes, retain theme tokens, pin newly added dependency versions and run the checks. Avoid installing another form/router/table system alongside the agreed libraries.

## Adili palette source

The public [Adili portal](https://adili.eacc.go.ke/) supplies the visual reference. Its [stylesheet](https://adili.eacc.go.ke/css/app.css) defines primary `#530b61` and button hover `#470952`; the portal welcome text uses `#ffe79b`. The app uses that purple for primary actions and gold as a light accent with dark text. Neutral/background/destructive colours are local supporting tokens, not claimed official brand specifications. No EACC logo or official endorsement is reproduced.

Keep text contrast, visible focus, labels, keyboard access, semantic headings and textual status indicators. Do not communicate validation or readiness using colour alone. Verify changes at narrow/mobile widths and with keyboard-only use.

## Scope and handoff

All data is fictional (PRD §17.1). The frontend never computes an authoritative score, deadline or state transition; it renders what the API returns, with provisional, reviewed and published values always labelled and pending never shown as zero. See [frontend-plan.md](frontend-plan.md) for the principles each screen is checked against.
