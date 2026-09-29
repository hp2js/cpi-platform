# CPI Platform design system (MASTER)

The visual language follows the U.S. Web Design System (USWDS 3) default theme, rebuilt in
Tailwind v4 with no USWDS package and no styled component library. Values below were taken
from designsystem.digital.gov (design tokens, state tokens, utilities, settings) on 2026-09-28.

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

Theme tokens, USWDS default theme. Classes: `bg-primary`, `text-ink`, `border-base-lighter`, …

### Base (neutrals)

| Token           | System token | Hex       | Use                                               |
| --------------- | ------------ | --------- | ------------------------------------------------- |
| `white`         | —            | `#ffffff` | Page and surface background                       |
| `base-lightest` | gray-5       | `#f0f0f0` | Subtle panels, table stripes, disabled field fill |
| `base-lighter`  | gray-cool-10 | `#dfe1e2` | Card borders, dividers, table header fill         |
| `base-light`    | gray-cool-30 | `#a9aeb1` | Decorative borders only (fails 3:1 against white) |
| `base`          | gray-cool-50 | `#71767a` | Hint text on white (4.6:1): use sparingly         |
| `base-dark`     | gray-cool-60 | `#565c65` | Secondary text (6.9:1), form control borders      |
| `base-darker`   | gray-cool-70 | `#3d4551` | Strong secondary text                             |
| `base-darkest`  | gray-90      | `#1b1b1b` | Same as ink                                       |
| `ink`           | gray-90      | `#1b1b1b` | Body text, table borders                          |
| `black`         | —            | `#000000` | Overlay scrim only (at reduced opacity)           |

### Primary (blue)

| Token             | System token  | Hex       | Use                                      |
| ----------------- | ------------- | --------- | ---------------------------------------- |
| `primary-lighter` | blue-10       | `#d9e8f6` | Selected row, current-item fill          |
| `primary-light`   | blue-30       | `#73b3e7` | Decorative accents only                  |
| `primary`         | blue-60v      | `#005ea2` | Buttons, links (7.1:1), current nav item |
| `primary-vivid`   | blue-warm-60v | `#0050d8` | Rarely: emphasis on white                |
| `primary-dark`    | blue-warm-70v | `#1a4480` | Button hover, visited link               |
| `primary-darker`  | blue-warm-80v | `#162e51` | Button active, dark header strip         |

### Secondary (red)

In USWDS "secondary" is red. It is used for destructive buttons and nothing else, so it is
never confused with error messages.

| Token               | System token | Hex       |
| ------------------- | ------------ | --------- |
| `secondary-lighter` | red-cool-10  | `#f3e1e4` |
| `secondary-light`   | red-30       | `#f2938c` |
| `secondary`         | red-50       | `#d83933` |
| `secondary-vivid`   | red-cool-50v | `#e41d3d` |
| `secondary-dark`    | red-60v      | `#b50909` |
| `secondary-darker`  | red-70v      | `#8b0a03` |

### Accent

| Token                 | Hex       |     | Token                 | Hex       |
| --------------------- | --------- | --- | --------------------- | --------- |
| `accent-cool-lighter` | `#e1f3f8` |     | `accent-warm-lighter` | `#f2e4d4` |
| `accent-cool-light`   | `#97d4ea` |     | `accent-warm-light`   | `#ffbc78` |
| `accent-cool`         | `#00bde3` |     | `accent-warm`         | `#fa9441` |
| `accent-cool-dark`    | `#28a0cb` |     | `accent-warm-dark`    | `#c05600` |
| `accent-cool-darker`  | `#07648d` |     | `accent-warm-darker`  | `#775540` |

### State

| Family   | `-lighter` | `-light`  | base      | `-dark`   | `-darker` |
| -------- | ---------- | --------- | --------- | --------- | --------- |
| info     | `#e7f6f8`  | `#99deea` | `#00bde3` | `#009ec1` | `#2e6276` |
| error    | `#f4e3db`  | `#f39268` | `#d54309` | `#b50909` | `#6f3331` |
| warning  | `#faf3d1`  | `#fee685` | `#ffbe2e` | `#e5a000` | `#936f38` |
| success  | `#ecf3ec`  | `#70e17b` | `#00a91c` | `#008817` | `#216e1f` |
| disabled | `#c9c9c9`  | `#919191` | `#757575` | `#454545` | `#1b1b1b` |

`emergency` `#9c3d10` and `emergency-dark` `#332d29` are defined but unused.

State colour usage (contrast against white or the `-lighter` fill):

- Fills: `-lighter` behind `ink` text (alerts, status tags).
- Bars and borders: the base token (alert left bar, 8 px).
- Text: only `error-dark` (error messages), `success-darker`, `info-darker`, `warning-darker`
  on white. `warning`, `success`, `info` and `error` base tokens are never used for text.

### Focus

`focus` = blue-40v `#2491ff`. Every focusable element gets `outline: 4px solid #2491ff`
(`$theme-focus-width: 0.5` = 4 px, offset 0), shown on `:focus-visible`. The outline is
never removed and never replaced by a translucent ring.

## Density

Every token in this file is in `rem`, and the app sets `html { font-size: 87.5% }` in
`styles.css`, so one rem is 14 px at the browser's default text size instead of USWDS's 16 px.
That single value scales type, spacing, radii and containers together, which is how USWDS
itself changes density (its root font size setting). It is a percentage so a person's own browser
text size still applies. **Pixel values in the tables below are at 16 px per rem; multiply by
0.875 for what renders** (body 14 px, h1 28 px, `p-4` 14 px).

Two things do not scale: breakpoints (media queries use the browser default, so `tablet` is
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

Only what the app uses. Markup follows the USWDS component's structure and states; styling is
Tailwind classes in `apps/web/src/components/ui`. Minimum target size is 44 × 44 px for every
control (stricter than WCAG 2.2's 24 px, as requested).

- **Header (basic header).** White bar, `base-lighter` bottom border. Wordmark left (product
  name, no seal), utility links right (inbox, account). Primary nav: text links in `ink`,
  bold; the current item has a 4 px `primary` bottom bar and `primary` text (not colour alone:
  the bar and `aria-current="page"`). Institution layout: tabs from `tablet`, a bottom bar below
  it (4 items, labels always visible, current item has a 4 px top bar). Officer, supervisor and
  admin layouts: a side navigation from `desktop` (usa-sidenav: current item has a 4 px left bar
  and bold text) and an "Open navigation" button with a drawer below it.
- **Buttons.** `min-h-touch` (44 px), padding 12 × 20 px, `text-md` bold, `rounded-md`.
  Default: `primary` → hover `primary-dark` → active `primary-darker`. Outline: white, inset
  2 px `primary` border, `primary` text. Secondary (destructive): `secondary` → `secondary-dark`
  → `secondary-darker`. Unstyled (link look) for low-emphasis actions. Disabled:
  `disabled-lighter` fill, `disabled-dark` text, `cursor-not-allowed`; prefer
  `aria-disabled` plus an explanation over hiding the reason.
- **Form fields.** Label above the control (`text-sm`, normal weight, `ink`), hint below
  the label (`text-xs`, `base`), then the error message, then the control. Controls: 44 px high,
  1 px `base-dark` border, square corners, white fill, max width `mobile-lg` (480 px) unless a
  table cell or full-width textarea. Use native `<select>`, checkbox and radio inputs styled
  USWDS-style (tile variant for important choices).
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
- **Cards.** White, 2 px `base-lighter` border, `rounded-lg`, no shadow. Header (bold
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
- **Step indicator.** No multi-step flow exists yet; do not build it until one does.

Behaviour for dialogs, menus, popovers and tooltips (focus trapping, escape, return focus)
stays with the existing unstyled Radix primitives; only their styling follows this file.
