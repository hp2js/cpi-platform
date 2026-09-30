# CPI Platform design system (MASTER)

The visual language uses the U.S. Web Design System (USWDS 3) foundation with the Adili
palette. Tailwind v4 implements the tokens; local React components and unstyled Radix
primitives implement the controls. The USWDS CSS/JavaScript package is not installed. This is
a local adaptation, not a claim of identical USWDS markup or certified compliance.

USWDS supplies typography, spacing, hierarchy, form/error patterns, state colours and the focus
rules (always visible, solid, never removed).
Adili supplies the palette, including the focus colour: purple primary actions, a restrained gold accent, purple-tinted
neutrals for text, borders and surfaces, and its red for destructive actions. Token names stay
USWDS's (`base-dark`, `secondary` …), so components never name a hex value or a brand. See [USWDS theme tokens](https://designsystem.digital.gov/design-tokens/color/theme-tokens/)
and [modal guidance](https://designsystem.digital.gov/components/modal/).

This is not a U.S. government site: no "official website" banner, federal seals or agency
branding. The product name and a plain wordmark are the only brand elements.

Source of truth for the tokens: `apps/web/src/styles.css` (`@theme`). This file explains them.
If the two disagree, fix one of them in the same change.

## Rules

- Tailwind's default colours, radii, shadows, breakpoints, font sizes and font weights are
  **replaced**, not extended (`--color-*: initial` and so on). Only the tokens below exist, so a
  class like `bg-blue-500`, `rounded-xl` or `shadow-lg` produces no CSS.
- No gradients, no glass or blur effects, no decorative shadows. Surfaces are flat, with
  borders.
- Motion is subtle or absent: colour and background changes only, 100–150 ms, and none
  under `prefers-reduced-motion`. No zoom, slide or bounce on dialogs and menus.
- Status is never shown by colour alone. Every state has a text label, and usually an icon.
- The app has no dark theme (USWDS has none either). Do not add `dark:` variants.

## Colour

Semantic theme tokens: USWDS names carrying the Adili palette. Classes: `bg-primary`,
`text-ink`, `border-base-lighter`, … The values are those of the app's Adili theme before the
USWDS migration (`apps/web/src/styles.css` at `09078d5^`), extended into full scales where
USWDS needs more steps. `apps/web/src/design-tokens.test.ts` reads `styles.css` and fails if
any text/surface pair used below drops under 4.5:1.

### Base (Adili neutrals)

Purple-tinted greys from the Adili theme. Pages sit on `canvas`; headers, navigation, cards,
tables and dialogs are `white`.

| Token           | Adili source     | Hex       | Use                                                   |
| --------------- | ---------------- | --------- | ----------------------------------------------------- |
| `white`         | card             | `#ffffff` | Surfaces: header, navigation, cards, tables, dialogs  |
| `canvas`        | background       | `#faf8fb` | Page background behind the surfaces                   |
| `base-lightest` | muted            | `#f1edf3` | Subtle panels, table stripes, read-only field fill    |
| `base-lighter`  | border           | `#ddd5e1` | Card borders, dividers, table header fill             |
| `base-light`    | input            | `#b7adbc` | Decorative borders only (fails 3:1 against white)     |
| `base`          | (extended)       | `#736a79` | Hint text: 5.2:1 on white, 4.9:1 on canvas. Sparingly |
| `base-dark`     | muted-foreground | `#635b69` | Secondary text (6.5:1), form control borders          |
| `base-darker`   | (extended)       | `#463d4c` | Strong secondary text (10.3:1)                        |
| `base-darkest`  | foreground       | `#271e2d` | Same as ink                                           |
| `ink`           | foreground       | `#271e2d` | Body text (16:1 on white), table borders              |
| `black`         | —                | `#000000` | Overlay scrim only (at reduced opacity)               |

### Primary (Adili purple)

The previously adopted [Adili portal](https://adili.eacc.go.ke/) palette used primary
`#530b61`, hover `#470952` and gold `#ffe79b` (recorded from its stylesheet and welcome text).
The remaining purple/gold steps below are local supporting shades, not official EACC tokens.
Use semantic classes rather than hex values in components. Branding does not replace state colours.

| Token             | Hex       | Use                                              |
| ----------------- | --------- | ------------------------------------------------ |
| `primary-lighter` | `#f1e8f4` | Selected row, current-item fill                  |
| `primary-light`   | `#c6a2d0` | Decorative accents only                          |
| `primary`         | `#530b61` | Buttons with white text, links, current nav item |
| `primary-vivid`   | `#702082` | Occasional emphasis on white                     |
| `primary-dark`    | `#470952` | Button hover, visited link                       |
| `primary-darker`  | `#35063e` | Button active, dark header strip                 |

### Secondary (Adili destructive red)

As in USWDS, "secondary" is the destructive colour: destructive buttons and the confirming
action of a destructive dialog (`AlertDialogAction variant="destructive"`), nothing else, so it
is never confused with error messages. The values are the Adili theme's destructive red,
darker than USWDS red-50 so white text passes comfortably (6.6:1 on `secondary`; USWDS's
`#d83933` gives 4.6:1).

| Token               | Hex       |
| ------------------- | --------- |
| `secondary-lighter` | `#fef3f2` |
| `secondary-light`   | `#fda29b` |
| `secondary`         | `#b42318` |
| `secondary-vivid`   | `#d92d20` |
| `secondary-dark`    | `#912018` |
| `secondary-darker`  | `#7a1a14` |

### Accent

| Token                 | Hex       |     | Token                 | Hex       |
| --------------------- | --------- | --- | --------------------- | --------- |
| `accent-cool-lighter` | `#e1f3f8` |     | `accent-warm-lighter` | `#fff8e3` |
| `accent-cool-light`   | `#97d4ea` |     | `accent-warm-light`   | `#fff0bd` |
| `accent-cool`         | `#00bde3` |     | `accent-warm`         | `#ffe79b` |
| `accent-cool-dark`    | `#28a0cb` |     | `accent-warm-dark`    | `#a67800` |
| `accent-cool-darker`  | `#07648d` |     | `accent-warm-darker`  | `#3a2b00` |

Gold (`accent-warm`) is a restrained brand highlight: the wordmark rule, demonstration role
icons, and the demonstration panel on the sign-in page (`accent-warm-lighter` fill,
`accent-warm` border). Use `ink`, `primary` or `accent-warm-darker` text on gold, never white. The cool
accent and all state colours remain USWDS values.

### State

| Family   | `-lighter` | `-light`  | base      | `-dark`   | `-darker` |
| -------- | ---------- | --------- | --------- | --------- | --------- |
| info     | `#e7f6f8`  | `#99deea` | `#00bde3` | `#009ec1` | `#2e6276` |
| error    | `#f4e3db`  | `#f39268` | `#d54309` | `#b50909` | `#6f3331` |
| warning  | `#faf3d1`  | `#fee685` | `#ffbe2e` | `#e5a000` | `#936f38` |
| success  | `#ecf3ec`  | `#70e17b` | `#00a91c` | `#008817` | `#216e1f` |
| disabled | `#ebe6ee`  | `#b7adbc` | `#8a8190` | `#635b69` | `#463d4c` |

The disabled family is USWDS's `$theme-color-disabled-*`, tinted to the Adili neutrals: the
stock greys were the only cold grey in the interface, and their dark fill made disabled
controls the loudest thing on a form. `disabled-lighter` is the fill, `disabled-light` the
border (the same as `base-light`), `disabled-dark` text on the fill (5.3:1, the same as
`base-dark`) and `disabled` unfilled text (3.7:1 on white, lighter than hint text).

`emergency` `#9c3d10` and `emergency-dark` `#332d29` are defined but unused.

State colour usage (contrast against white or the `-lighter` fill):

- Fills: `-lighter` behind `ink` text (alerts, status tags).
- Bars and borders: the base token (alert left bar, 8 px).
- Text: only `error-dark` (error messages), `success-darker`, `info-darker`, `warning-darker`
  on white. `warning`, `success`, `info` and `error` base tokens are never used for text.

### Focus

Focus uses the USWDS focus settings (`$theme-focus-color`, `-width`, `-offset`), which USWDS
exposes for theming, set to the Adili palette. What USWDS requires is kept: every focusable
element shows a solid outline, it is never removed or replaced by a translucent ring, and it
contrasts at least 3:1 with every surface it is drawn on (`design-tokens.test.ts` checks the
pairs).

| Token           | Hex       | Where                                         |
| --------------- | --------- | --------------------------------------------- |
| `focus`         | `#530b61` | Light surfaces (white, canvas, tinted fills)  |
| `focus-on-dark` | `#ffe79b` | Purple surfaces, marked `data-surface="dark"` |

Styles read the runtime variable `--focus-color`, which `data-surface="dark"` switches to gold
(the admin sidebar and its drawer).

- Controls (links, buttons, tabs, rows): 3 px on `:focus-visible`. Buttons, `role="button"` and
  tabs sit it 4 px off their edge, as USWDS does, so it stays clear of a filled purple button.
- Fields (input, select trigger, combobox, textarea): 2 px at offset 0 on any focus, including a
  click, so people see where they type. It thickens the field's own edge into a purple frame
  rather than haloing it. An invalid field keeps its 4 px `error-dark` border inside the ring.
- Checkboxes and radios: 2 px, 2 px off, so a checked purple box keeps a visible gap.
- `data-focus-inset` draws the outline inside (offset −3 px) where a scrolling list would clip
  it. `data-focus-within` marks a row that acts as one field (the combobox search: icon and
  input): the row takes the 2 px field ring inside its edge, and its input draws none.

The earlier USWDS blue (`#2491ff`, 4 px on everything) was replaced because it was the only
blue in the interface and, on every clicked field, as loud as the primary action.

## Density

Every token in this file is in `rem`, and the app sets `html { font-size: 87.5% }` in
`styles.css`, so one rem is 14 px at the browser's default text size instead of USWDS's 16 px.
That single value scales type, spacing, radii and containers together, which is how USWDS
itself changes density (its root font size setting). It is a percentage so a person's own browser
text size still applies. **Pixel values in the tables below are at 16 px per rem; multiply by
0.875 for what renders** (body 14 px, h1 28 px, `p-4` 14 px).

Three things do not scale: the focus outline (2–3 px), breakpoints (media queries use the browser default, so `tablet` is
still 640 px) and the minimum target, `--spacing-touch: 44px`, used as `min-h-touch`,
`size-touch`, `min-w-touch` on every control. Do not use `h-11`/`min-h-11` for targets; the
guard test rejects them.

## Typography

- Family: **Public Sans** (variable, 300–700), self-hosted as a woff2 in `apps/web/public/fonts`
  with `font-display: swap`. Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
Helvetica, Arial, sans-serif`. Classes: `font-sans` (default), `font-mono` for reference codes.
- Weights: `font-light` 300, `font-normal` 400, `font-bold` 700. USWDS defines no medium or
  semibold; use bold for emphasis, headings, buttons and table headers.
- Body: `sm` (16 px), line height 1.62 (`$theme-body-line-height: 5`), measure 68ch
  (`$theme-text-measure: 4`, class `max-w-measure`).
- Headings: line height 1.2 (`$theme-heading-line-height: 2`), bold.

Font sizes (USWDS theme tokens; Tailwind names are reused with USWDS values):

| Class      | Px  | rem    | Default line height | Use                                    |
| ---------- | --- | ------ | ------------------- | -------------------------------------- |
| `text-3xs` | 13  | 0.8125 | 1.35                | Legal/footnote only. Never body text   |
| `text-2xs` | 14  | 0.875  | 1.35                | Badges/tags, dense table metadata      |
| `text-xs`  | 15  | 0.9375 | 1.5                 | Hint text, captions, bottom nav labels |
| `text-sm`  | 16  | 1      | 1.62                | **Body**, form controls, table cells   |
| `text-md`  | 17  | 1.0625 | 1.62                | Buttons, card headings                 |
| `text-lg`  | 22  | 1.375  | 1.2                 | Lead paragraph, h3                     |
| `text-xl`  | 32  | 2      | 1.2                 | h1                                     |
| `text-2xl` | 40  | 2.5    | 1.2                 | Display only                           |
| `text-3xl` | 48  | 3      | 1.2                 | Display only                           |

Heading map for app screens: h1 `text-xl` (32), h2 `text-lg` (22), h3 `text-md` bold (17),
h4 `text-sm` bold (16). Each size carries its USWDS line height (table above); override with
Tailwind's `leading-tight` (1.25) or `leading-none` only for single-line UI such as buttons.
Note `text-base` is the **colour** `base`, not a size: use `text-sm` for body text.

## Spacing

USWDS 8 px unit scale plus the 4 px and 12 px half steps, and the 20 px step USWDS also
defines (`205`).

| USWDS unit | Px  | Tailwind class number     |
| ---------- | --- | ------------------------- |
| `05`       | 4   | `1` (`p-1`, `gap-1` …)    |
| `1`        | 8   | `2` (`p-2`, `gap-2` …)    |
| `105`      | 12  | `3` (`p-3`, `gap-3` …)    |
| `2`        | 16  | `4` (`p-4`, `gap-4` …)    |
| `205`      | 20  | `5` (`p-5`, `gap-5` …)    |
| `3`        | 24  | `6` (`p-6`, `gap-6` …)    |
| `4`        | 32  | `8` (`p-8`, `gap-8` …)    |
| `5`        | 40  | `10` (`p-10`, `gap-10` …) |
| `6`        | 48  | `12` (`p-12`, `gap-12` …) |
| `7`        | 56  | `14` (`p-14`, `gap-14` …) |
| `8`        | 64  | `16` (`p-16`, `gap-16` …) |
| `9`        | 72  | `18` (`p-18`, `gap-18` …) |
| `10`       | 80  | `20` (`p-20`, `gap-20` …) |
| `15`       | 120 | `30` (`p-30`, `gap-30` …) |

Also allowed: `0`, `px` (1 px) and `auto`.

Tailwind keeps its 4 px multiplier (`--spacing: 0.25rem`), so a class number is twice the USWDS
unit: `p-2` = 8 px = USWDS `padding-1`. Padding, margin, gap and space utilities must use the
numbers in the last column; `apps/web/src/design-tokens.test.ts` fails on anything else
(`p-1.5`, `gap-7`, `mt-0.5` …). Widths, heights and offsets are not restricted (a target is
`min-h-touch`, fixed at 44 px).

Layout constants: site margins 32 px (`$theme-site-margins-width: 4`) from `tablet` up, 16 px
below; content max width `desktop` (1024 px).

## Breakpoints

Mobile-first, `min-width`. Only these exist; Tailwind's `sm/md/lg/xl/2xl` are removed.

| Prefix        | Min width |
| ------------- | --------- |
| (none)        | 0         |
| `mobile-lg:`  | 480 px    |
| `tablet:`     | 640 px    |
| `desktop:`    | 1024 px   |
| `widescreen:` | 1400 px   |

Container widths (`max-w-*`) use the same USWDS names: `mobile` 320, `mobile-lg` 480,
`tablet` 640, `tablet-lg` 880, `desktop` 1024, `desktop-lg` 1200, `widescreen` 1400, plus
`measure` (68ch). The accessibility suite also checks 390 px with no horizontal scroll.

## Radius

| Class          | Value  | Use                                                |
| -------------- | ------ | -------------------------------------------------- |
| `rounded-none` | 0      | Inputs, selects, textareas, tables, alerts         |
| `rounded-sm`   | 2 px   | Tags/badges                                        |
| `rounded-md`   | 4 px   | Buttons (`$theme-button-border-radius: md`), menus |
| `rounded-lg`   | 8 px   | Cards, dialogs                                     |
| `rounded-full` | 9999px | Count badges and radio buttons only                |

## Shadow

USWDS values. Only overlays (menus, popovers, dialogs) get a shadow; cards and panels use a
border instead.

| Class      | Value                            | Use                 |
| ---------- | -------------------------------- | ------------------- |
| `shadow-1` | `0 1px 4px 0 rgb(0 0 0 / 0.1)`   | Not used by default |
| `shadow-2` | `0 4px 8px 0 rgb(0 0 0 / 0.1)`   | Menus, popovers     |
| `shadow-3` | `0 8px 16px 0 rgb(0 0 0 / 0.1)`  | Dialogs, sheets     |
| `shadow-4` | `0 12px 24px 0 rgb(0 0 0 / 0.1)` | Not used            |
| `shadow-5` | `0 16px 32px 0 rgb(0 0 0 / 0.1)` | Not used            |

## Components

Only what the app uses. Patterns follow USWDS guidance; React/Radix provide the accessible semantics and behavior. Styling is
Tailwind classes in `apps/web/src/components/ui`. Minimum target size is 44 × 44 px for every
control (stricter than WCAG 2.2's 24 px, as requested).

- **Header (basic header).** White bar, `base-lighter` bottom border. Wordmark left (product
  name with its 4 px gold rule, no seal), utility links right (inbox, account). Below
  `desktop`, officer, supervisor and admin headers show the wordmark beside the menu button,
  so every screen names the product. Primary nav: text links in `ink`,
  bold; the current item has a 4 px `primary` bottom bar and `primary` text (not colour alone:
  the bar and `aria-current="page"`). Institution layout: from `desktop`, the same white side
  navigation as the officer (wordmark, "Reporting for" the institution, the sections with
  attention badges, then the year's quarters, each with its state in words, its due date and a
  link to its report); tabs from `tablet` to `desktop`; a bottom bar below `tablet` (4 items,
  labels always visible, current item has a 4 px top bar). Officer, supervisor and
  admin layouts: a side navigation from `desktop` (usa-sidenav: current item has a 4 px left bar
  and bold text) and an "Open navigation" button with a drawer below it. Officer and supervisor
  navigation is white; the admin console keeps the Adili `primary` sidebar with white text, a
  white current-item bar and the wordmark's gold rule, in the drawer as well.
- **Buttons.** Two sizes, one target. `default` (page and form actions): `min-h-touch` (44 px),
  padding 12 × 20 px, `text-md` bold, `rounded-md`. `sm`/`xs` and `icon-sm`/`icon-xs` (toolbars,
  table rows, card headers): `min-h-compact`/`size-compact` (36 px) with `text-sm`, and an
  invisible `::after` that keeps the hit area 44 px tall and at least 44 px wide, so the
  target never shrinks. The guard test checks every size keeps a 44 px target.
  Variants, in order of emphasis:
  - Default: `primary` → hover `primary-dark` → active `primary-darker`. **One per area**: the
    action that completes the task (Submit, Save, Add risk in its dialog, Publish).
  - Outline: white, inset 2 px `primary` border, `primary` text. Real secondary actions that
    change something (Save draft, Import from CSV, Add activity, Request clarification,
    Return for revision).
  - Plain: white, inset 1 px `base-dark` border, `ink` text. Dismissive and navigational
    actions that change nothing: Cancel, Keep, Close, back links (All reports), View receipt,
    Print, exports, pager Newer/Older, Retry. `AlertDialogCancel` uses it.
  - Ghost: no border, `primary` text. Actions repeated on every table row or card (Edit,
    Change role, Deactivate behind a confirmation) and icon-only row actions (`icon-sm`, with
    an `aria-label`). A row keeps its actions on one line.
  - Secondary (destructive): `secondary` → `secondary-dark` → `secondary-darker`, only to
    confirm deleting, discarding or replacing work.
  - Disabled: the shared disabled treatment (see **Disabled and read-only**). Ghost and link
    buttons stay unfilled and turn `disabled` grey. Say why an action is unavailable next to
    it rather than hiding it.
- **Form fields.** Label above the control (`text-sm`, normal weight, `ink`), hint below
  the label (`text-xs`, `base`), then the error message, then the control. Controls: 44 px high,
  1 px `base-dark` border, square corners, white fill. Width: single-line controls (input,
  select, combobox) cap at `--field-max`, 480 px in a single-column form so a field's width
  hints at its answer; inside a `data-columns` container (dialogs, drawers, multi-column field
  rows and filter bars) `--field-max` is `none` and they fill their column, so fields side by
  side line up. A width in `className` (a short code, a number of days) still wins. Textareas
  always fill their container. Fields side by side in a row share the row's lines with CSS
  subgrid (label, hint, control, error), so their controls line up even when only one has a
  hint or an error. Use `SelectField` (Radix Select) for short fixed lists, `Combobox` for searchable lists,
  and the existing checkbox/radio wrappers; their visual states follow USWDS. Do not mix
  USWDS JavaScript with Radix on the same control.
- **Selects and comboboxes look the same.** Both use the field box (`fieldControl` in
  `components/ui/input.tsx`), a single `ChevronDown` in `ink`, and `base` text for a placeholder
  ("Choose…"). Their lists share one popup: white, 1 px `base-light` border, `rounded-md`,
  `shadow-2`, 44 px options, the highlighted option on `primary-lighter` with `primary-darker`
  text, a check beside the chosen one, and unavailable options in `disabled` grey with
  `cursor-not-allowed`. Menu items (`DropdownMenu`) follow the same highlight and disabled
  colours.
- **Disabled and read-only.** One disabled treatment for every control, as USWDS's
  `u-disabled`: `disabled-lighter` fill, `disabled-light` border, `disabled-dark` text and
  icons, `cursor-not-allowed`. A checked checkbox or radio keeps the `disabled-lighter` fill
  with a `disabled-dark` tick or dot; a radio card greys as a whole. The checkbox or
  radio label turns `disabled-dark`; field labels above a control stay `ink`. Unfilled
  controls (ghost and link buttons, list rows, options) only change their text to `disabled`.
  Read-only fields (a value to copy, not change) get a `base-lightest` fill and `base-light`
  border so they don't look editable; they stay focusable and selectable. The fill is close to
  the disabled one on purpose; what tells them apart is the text (`ink`, can be copied, versus
  `disabled-dark`) and the cursor.
- **Error state (`usa-form-group--error`).** The group gets a 4 px `error-dark` left border
  and 16 px left padding; the message is bold `error-dark` text with an `id`, placed between
  label/hint and control; the control gets a 4 px `error-dark` border, `aria-invalid="true"`
  and `aria-describedby` pointing to hint + message. On submit with errors, an error summary
  alert (heading "There is a problem", one link per field) appears above the form and takes
  focus.
- **Alerts.** 8 px left bar in the state colour (`$theme-alert-bar-width: 1`), `-lighter`
  fill, `ink` text, padding 16 × 20 px, square corners, icon + bold heading + body. Variants:
  info, success, warning, error, and slim (no heading). `role="alert"` only for errors that
  just happened; otherwise `role="status"` or none.
- **Cards.** White, 1 px `base-lighter` border (the Adili weight; every bordered panel uses
  the same one), `rounded-lg`, no shadow. Header (bold
  heading), body, footer (actions). Cards group related content; they are not links unless
  the whole card has one clear destination.
- **Tables.** Borderless USWDS variant: 1 px `ink` bottom border under the header, 1 px
  `base-lighter` between rows, cell padding 8 × 16 px, header bold, left-aligned text,
  right-aligned numbers. Caption or `aria-label` required. Below `tablet`, wide tables either
  scroll inside a focusable, labelled region or stack (`usa-table--stacked`: each cell shows
  its header).
- **Tags / status.** `rounded-sm`, `text-2xs` bold, state `-lighter` fill with `ink` text,
  always an icon plus the text label.
- **Pagination.** USWDS pagination: Previous / numbered pages / Next, each 44 px; the current
  page is `ink` fill with white text and `aria-current="page"`; the result range ("1–20 of 64")
  is shown as text.
- **Links.** Plain `<a>` without classes get the USWDS link style from the base layer. Router
  links (and any link with other classes) add the `usa-link` utility: `primary`, underlined,
  `primary-dark` on hover and visited.
- **Error summary** (`components/error-summary.tsx`). After a failed submit: "There is a
  problem" alert above the form, 8 px `error` bar on `error-lighter`, focused on arrival, one link
  per error that moves focus to its field. The fields keep their own inline errors. Remount it
  (key on the submit attempt) so each attempt moves focus again.
- **Quarter status** (`ObligationStatus` in `components/status.tsx`). A quarter that has not
  started and is not yet due shows one quiet "Not yet due" line, not two tags, so grids
  highlight only the cells that need action.
- **Glossary** (`components/glossary.tsx`). A USWDS-style disclosure whose summary names the
  terms it defines, placed on the screens where those terms appear. Terms in our own copy
  are spelled out on first use, e.g. "Corruption Prevention Committee (CPC)".
- **Dialogs and confirmations.** Centered white panels, `rounded-lg`, `shadow-3`, black 50%
  scrim. Width is viewport minus 2rem, capped at `mobile-lg`; use `tablet:max-w-tablet`,
  `tablet:max-w-measure` or `tablet:max-w-desktop` for genuinely wider content. Height is
  capped at `calc(100dvh - 2rem)` with internal vertical scrolling. Keep a title and description,
  reserve space for the 44 px close control, and let long titles wrap. The confirming action of
  a destructive dialog (delete, discard, start a new run) is `variant="destructive"`; the
  safe `Cancel`/`Keep` action sits beside it. Footer buttons follow
  DOM order on mobile and wrap on larger screens, so visual and keyboard order agree. Radix
  traps focus, handles Escape and restores focus; confirmations keep their safe cancel action.
  Do not add per-screen overflow fixes; the file viewer alone owns a dedicated preview layout.
  **One scroll at a time:** a scroll area inside a dialog or drawer keeps its scroll
  (`overscroll-behavior: contain`, set once in `styles.css`), so reaching the end of a preview,
  table or list does not scroll the dialog or the page. A scroll area that holds absolutely
  positioned content (the PDF page text for screen readers) is `relative`, so that content
  cannot stretch the dialog.
- **Drawers and popovers.** Drawers fit the dynamic viewport and scroll; headers reserve close
  control space. The close control takes the drawer's text colour, so it stays visible on a
  dark drawer. The combobox search row (icon and input) carries
  `data-focus-within`, so the whole row takes the focus ring, inside the popover edge. Popovers stay within available viewport height and width. Keep all controls
  reachable on short landscape screens and at enlarged text sizes.
- **Scroll bars.** Never hidden. Tinted: a `base` thumb on a transparent track (3:1 or more on
  every light surface), a translucent white thumb on purple surfaces (`data-surface="dark"`).
  The page keeps the browser's scroll bar width, an easier target; inner scroll areas are thin.
  Set once in `styles.css` (`scrollbar-color`, with a WebKit fallback); never style them per
  component.
- **Sign-in page.** One card with the sign-in form; the filled "Sign in" is its only primary
  action. Demonstration accounts sit in a gold panel below the card ("Trying out the
  platform?"), with an outline button that opens the drawer, so a demo is easy to find without
  competing with the form. Nothing floats over the page.
- **Class merging.** Always use `cn` from `lib/utils.ts`. It knows our custom container names
  and that `text-base` is a colour, not a font size. New tokens must update its configuration
  when needed; otherwise caller overrides can silently fail.
- **Step indicator.** No multi-step flow exists yet; do not build it until one does.

Behaviour for dialogs, menus, popovers and tooltips (focus trapping, escape, return focus)
stays with the existing unstyled Radix primitives; only their styling follows this file.
