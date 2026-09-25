# Frontend contribution guide

## Entry points

`src/main.tsx` creates one QueryClient and one router. `src/router.tsx` defines typed code-based routes, route context and the shared layout. `src/screens/foundation.tsx` demonstrates all four TanStack libraries. Add feature screens alongside it; keep reusable primitives in `src/components/ui` and feature components outside that generated directory.

## Server data: TanStack Query

Use `src/lib/api.ts` for same-origin `/api` requests. It supports cancellation, a five-second timeout, non-JSON gateway errors and field-validation errors. TypeScript transport types live in `@cpi/contracts`; they do not replace server-side validation or runtime validation of untrusted payloads. The only implemented API contract is health readiness.

Put query keys/options beside each feature. Include every filter, institution identifier and reporting period that affects the response in its query key. Render pending, error, empty and success states. Preserve usable data during background refreshes. Do not put fetched entities in a second global store.

After a successful mutation, invalidate the specific affected query family with `queryClient.invalidateQueries({ queryKey: [...] })`; only report success once the server confirms it. The health refresh button is a working invalidation example. Do not retry writes by default. Clear institution-scoped cached data when identity or access context changes once authentication exists.

## Navigation and lists: Router + Table

The pinned TanStack Table v9 API uses `useTable` and explicit `tableFeatures` (filtering, sorting and visibility). Register row model factories on the feature definition; do not copy v8 `useReactTable` examples.

The foundation route normalizes `q`, `sort` and `desc` in `parseSearch`. The table reads those values as controlled state, so refreshes and shared URLs preserve the view. Typing uses replace navigation to avoid a browser-history entry per keystroke; sorting creates normal history entries. Sorting is keyboard operable with `aria-sort` and a visible direction indicator.

Use Table for column/row behaviour and shadcn's semantic table elements for rendering. Small fixtures are filtered locally. When real lists use server pagination, put page/filter/sort in route search and query keys, and use Table's manual pagination/sorting/filtering options. Do not apply client-side filtering to only one server page.

## Forms: TanStack Form

`PreviewForm` demonstrates controlled fields, blur/change handling, validation, accessible errors and submit feedback. It previews a fictional value locally and never pretends to save. Dialog supplies focus trapping, Escape-to-close and focus restoration.

For a real write, validate at the server and use Query's mutation state. The agreed error envelope is `{ message, fieldErrors?: Record<string, string> }`; `ApiError` preserves it. Once backend validation is introduced, map only known field names to TanStack Form's `form.setFieldMeta(name, previous => ({ ...previous, errorMap: { ...previous.errorMap, onSubmit: message } }))`, show unknown/global errors in an alert, and clear stale server errors when that field changes. Give each error an ID referenced by the input's `aria-describedby`, set `aria-invalid`, and focus the first invalid field. Disable duplicate submits while pending; preserve user input after errors. Add endpoint-specific integration tests when the endpoint exists.

## Styling and components

Tailwind v4 uses the Vite plugin and CSS-first configuration. Semantic theme tokens live only in `src/styles.css`; use `bg-primary`, `text-muted-foreground`, etc. rather than repeating hex colours in screens. Components were generated from the official shadcn/ui registry (new-york style) and are editable local code.

Add primitives from the repo root:

```sh
pnpm dlx shadcn@4.21.0 add <component> -c apps/web
```

Review generated changes, retain theme tokens, pin newly added dependency versions and run the checks. Avoid installing another form/router/table system alongside the agreed libraries.

## Adili palette source

The public [Adili portal](https://adili.eacc.go.ke/) supplies the visual reference. Its [stylesheet](https://adili.eacc.go.ke/css/app.css) defines primary `#530b61` and button hover `#470952`; the portal welcome text uses `#ffe79b`. The foundation uses that purple for primary actions and gold as a light accent with dark text. Neutral/background/destructive colours are local supporting tokens, not claimed official brand specifications. No EACC logo or official endorsement is reproduced.

Keep text contrast, visible focus, labels, keyboard access, semantic headings and textual status indicators. Do not communicate validation or readiness using colour alone. Verify changes at narrow/mobile widths and with keyboard-only use.

## Scope and handoff

The scaffold is the starting point for HP2-8's design work and HP2-14's application UI. Fixtures are visibly synthetic. It contains no scoring, submission approval, authentication, evidence storage or institutional permissions. Build those from the PRD and their own acceptance criteria rather than treating the sample list as a domain model.
