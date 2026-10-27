# Research: which styling and component approach fits budjet?

Answers [#74](https://github.com/JaykeOps/budjet/issues/74) (wayfinder map [#72](https://github.com/JaykeOps/budjet/issues/72)). Input to a future ADR, not the ADR itself. Researched 2026-10-27 against `master` at `ceacfa5`.

## Recommendation

**Plain CSS with design tokens, plus React Aria Components for the widgets native HTML does not cover well.**

- Tokens are CSS custom properties on `:root`, each written once with `light-dark(<light>, <dark>)` and `color-scheme: dark light`, so the system setting picks the mode with no JavaScript.
- Each slice styles its own UI with a private `*.module.css` file, next to the component that uses it.
- Interactive widgets (Select or ComboBox for Category and Account pickers, Menu, Popover, Dialog or Modal sheets, Tabs, Switch) come from `react-aria-components`. They are wrapped once in a small shared, styled `src/ui/` module so every slice uses the same Button, Dialog and Select.
- Prefer native elements (`<button>`, `<input>`, `<dialog>`) wherever they already meet WCAG 2.2 AA. Reach for React Aria only where native HTML falls short.

**Runner-up:** shadcn/ui with `--base aria` on Tailwind v4. It produces the same React Aria primitives with a ready-made look, at the costs listed under Option B. Pick it instead if the prototype tickets show that hand-writing component CSS is the bottleneck.

## What the repo constrains, checked concretely

| Constraint | What I found in the repo |
|---|---|
| ADR 0001: every tool comes from `flake.nix` | The flake provides Node 22, pnpm (12.9.0), biome and dagger. npm build plugins such as `@tailwindcss/vite` are ordinary devDependencies like `vite`, so they don't break the rule. A standalone CLI does: the shadcn CLI would have to come from the flake (nixpkgs carries `shadcn`, 4.11.0 on nixpkgs-weekly) or be pinned as a devDependency. It can't be run through `pnpm dlx shadcn@latest`, which is what the shadcn docs tell you to do. |
| ADR 0002: no install scripts | `pnpm-workspace.yaml` has `strictDepBuilds: true` and an empty `allowBuilds: {}`. Below are results from real `pnpm add` runs in a scratch copy of the repo. |
| Performance budget | `dagger call performance` runs `pnpm test:performance`, which is the vitest `performance` project (`src/**/*.performance.test.ts`). The only test there is `src/slices/budget-totals/budget-totals.performance.test.ts`, which requires the Budget Totals folds over ten years of records to take under 50 ms. **No bundle-size or load-time budget exists today.** No styling choice can fail the current performance check. Bundle cost is reported below anyway, because it is what the user pays on a phone. |
| React 19 / Vite 8 | `react@19.3.1` and `vite@8.3.5`. Peer ranges are listed below. |
| ADR 0005: feature slices | `scripts/feature-slice-architecture/check.ts` looks only at relative imports (`specifier.startsWith(".")`) of `.ts`/`.tsx` files. Code outside `src/slices/` counts as kernel or app shell and is not checked. |
| Current styling | None. No `.css` files exist. Slices use inline `style={…}`, a `WARNING_RED` constant and the system colour `Canvas`. Every look is new work whichever approach wins. |
| Visual reference | Map #72 points to `docs/design/reference/`, but **that folder does not exist on `master` or on any pushed branch.** |

### Install-script check (pnpm 12.9.0, `strictDepBuilds: true`)

| Package(s) | Version | Install result |
|---|---|---|
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | Clean. The native `@tailwindcss/oxide` and `lightningcss` binaries arrive as per-platform optional packages, with no build scripts. |
| `react-aria-components` | 1.22.1 | Clean |
| `radix-ui` | 1.8.1 | Clean |
| `@base-ui/react` | 1.9.0 | Clean |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css` (shadcn's runtime deps) | 0.7.1, 2.1.1, 3.7.0, 1.61.0, 1.4.0 | Clean |
| `shadcn` CLI | 4.22.1 | Clean |
| `@vanilla-extract/css` + `@vanilla-extract/vite-plugin` | 1.21.3 / 5.2.6 | **Fails with `ERR_PNPM_IGNORED_BUILDS: esbuild@0.28.2`.** `@vanilla-extract/integration` depends directly on `esbuild`, which has a `postinstall`. Adopting it means asking the human to acknowledge `esbuild: false` under `allowBuilds`. |
| `@react-aria/optimize-locales-plugin` | 2.1.0 | No scripts. Its only dependency is `unplugin`. |

Vite 8 already depends on `lightningcss` 1.33 and `rolldown` (both native binaries delivered the same way), so Tailwind's native binary adds no new kind of risk. Tailwind does bring a second `lightningcss` copy (1.32.0).

### Bundle cost (production `vite build`, gzip -9)

I built one probe app per candidate with the repo's Vite 8 and React 19. The component probes render a Dialog containing a Select (two options) and a Switch. The native probe uses `<dialog>`, `<select>` and a checkbox with `role="switch"`.

| Probe | JS gzip | Δ vs React alone | CSS gzip |
|---|---:|---:|---:|
| React 19 + native elements + CSS Module (baseline) | 67.9 KB | — | 0.3 KB |
| + Tailwind v4 (a card, meter and button in utilities, shadcn-style token mapping) | 68.0 KB | +0 | 2.7 KB |
| + `cva` + `clsx` + `tailwind-merge` (the shadcn `cn()` helpers) | 76.4 KB | +8.5 KB | — |
| + Radix (`radix-ui`: Dialog, Select, Switch) | 99.1 KB | +31 KB | — |
| + Base UI (Dialog, Select, Switch) | 112.4 KB | +44 KB | — |
| + React Aria Components (DialogTrigger/Modal/Dialog, Select/Popover/ListBox, Switch) | 126.4 KB | +58 KB | — |
| … same, with `optimize-locales-plugin` limited to `en-US` | 120.8 KB | +53 KB | — |

All three libraries tree-shake by component (`sideEffects` is `false`, or `["*.css"]` for React Aria). Each extra widget therefore adds less than these first-widget numbers, because the shared focus, overlay and positioning code is already in the bundle. React Aria is the heaviest. The English-only locale plugin saves about 5.6 KB on this probe.

### Light and dark tokens without a library

Vite 8 minifies CSS with Lightning CSS by default ([Vite features: CSS](https://vite.dev/guide/features.html)). In the probe build it also **lowered `light-dark()` into a polyfill driven by `prefers-color-scheme`** and flattened native CSS nesting, with no configuration. One custom property per token, written once, therefore yields both modes. The polyfill follows the media query only, which matches #72 ("a light mode that follows the system setting"). A manual theme toggle would need a different mechanism. Lightning CSS also reordered `color-scheme: dark light` to `light dark`. Browsers always report light or dark, so this only matters as a fallback.

## Options compared

### A. Plain CSS (tokens + CSS Modules) + React Aria Components (recommended)

- **ADR 0001/0002:** no new tool. CSS Modules and Lightning CSS are built into Vite. `react-aria-components` installs cleanly.
- **React 19 / Vite 8:** peer `react ^16.8 … || ^19.0.0-rc.1`, so React 19 is supported. No Vite plugin is needed.
- **Accessibility:** React Aria is the strongest of the candidates. It follows the ARIA Authoring Practices and is "tested across a variety of devices, browsers, and screen readers": VoiceOver on macOS and iOS, JAWS, NVDA and TalkBack ([quality](https://react-aria.adobe.com/quality)). "All behaviors work without a keyboard, ensuring touch screen reader users have full access" ([react-aria.adobe.com](https://react-aria.adobe.com/)). Phone use is first-class for budjet, so touch screen-reader support matters. Styling hooks are data attributes (`[data-pressed]`, `[data-focus-visible]`, `[data-invalid]`), which CSS Modules can target directly.
- **Theming:** tokens are custom properties. Dark and light come from `light-dark()` plus Lightning CSS, as shown above.
- **Feature slices:** a slice's `*.module.css` is private by construction, because it is imported only by that slice's components. The shared, styled wrappers live in `src/ui/`. The checker allows slices to import it, since non-slice code is unchecked. ADR 0005 says the shared kernel is Money, Month and the Change Log, so **the ADR should name `src/ui/` as a second shared module** (presentational only, no domain state). It should also decide whether the checker forbids `src/ui/` from importing slices.
- **Costs:** the largest bundle increase measured (about 53 KB gzip with English-only locales, paid once). Every component's look is hand-written. React Aria's `NumberField` formats with `Intl.NumberFormatOptions` ([NumberField](https://react-aria.adobe.com/NumberField)) but works on JS numbers. budjet already owns `formatMoney`/`parseMoney` over minor units in `src/kernel/money.ts`, so keep money input as a plain text field over those rather than adopting `NumberField`.

### B. shadcn/ui on Tailwind v4 (runner-up)

- **What it is:** a CLI that copies component source into the repo (`pnpm dlx shadcn@latest init`, then `add button`; [Vite install](https://ui.shadcn.com/docs/installation/vite)). Since July 2026, **Base UI is the default base**, Radix is still supported with `-b radix` and "is not being deprecated" ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)), and **React Aria is available with `--base aria`** ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)).
- **ADR 0001/0002:** installs cleanly. The CLI must come from the flake or a pinned devDependency, not `dlx @latest`. The probe's `pnpm add` resolved 4.22.1 while 4.23.0 had been published that same day: the lockfile's supply-chain policy held back the newest release.
- **Theming:** semantic tokens (`background`/`foreground`, `card`, `primary`, `muted`, `destructive`, `ring`…) in oklch, mapped to utilities through `@theme inline` ([theming](https://ui.shadcn.com/docs/theming)). Dark mode is a `.dark` class with `@custom-variant dark (&:is(.dark *))` and a theme provider. Tailwind's own default is `prefers-color-scheme` ([dark mode](https://tailwindcss.com/docs/dark-mode)), so budjet would remove that variant, or define its tokens with `light-dark()` as in the probe.
- **Costs:**
  - The `cn()` helpers add about 8.5 KB gzip, on top of whichever primitive library is the base.
  - Two styling languages in review: utilities in JSX plus the token CSS.
  - **The CLI writes imports through a path alias (`@/components/ui/...`), and `check.ts` ignores non-relative imports.** With an alias, `@/slices/x/commands` would slip past the ADR 0005 checker. Adopting this option means extending the checker to resolve the alias first.
  - Generated code is yours to maintain after `add`.
- **Benefit:** a polished, consistent starting look for every widget, which is faster to prototype with.

### C. Radix or Base UI primitives + CSS Modules

- Lighter than React Aria (+31 KB and +44 KB gzip in the probe), both install cleanly, and both accept React 19.
- Both leave focus styles, contrast and labels to the developer ([Base UI](https://base-ui.com/react/overview/accessibility), [Radix](https://www.radix-ui.com/primitives/docs/overview/accessibility)), as React Aria also does. Their published testing claims are less specific about mobile screen readers.
- Choose Base UI over Radix if size wins, since shadcn now treats Base UI as its default line. This trades React Aria's touch screen-reader testing for about 10–20 KB.

### D. vanilla-extract

- Typed tokens and zero runtime cost, but **it fails ADR 0002 as things stand**: `esbuild`'s `postinstall` needs a human-approved `allowBuilds` entry.
- It also adds a build-time evaluation step (`vite-node`) to every CSS change, and does nothing for accessibility. Not recommended.

### E. Plain CSS with no component library

- Smallest bundle. Native `<dialog>`, `<select>` and `<details>` cover a lot.
- budjet still needs an accessible custom picker (Category tiles with icons and Available amounts don't fit in a `<select>`), menus and popovers. Building those to WCAG 2.2 AA by hand is where a library pays for itself. Option A is this option plus a library for exactly that gap.

## Trade-offs of the recommendation

- **For:**
  - No new build tooling or install scripts.
  - One token source that follows the system theme with no JavaScript.
  - Slice-private styles fit ADR 0005 without changing the checker.
  - The best-tested accessibility of the candidates, including touch screen readers.
  - Works with React 19 and Vite 8 today.
- **Against:**
  - The heaviest library measured (about +53 KB gzip).
  - No ready-made look, so prototypes start from bare widgets.
  - The ADR must widen "shared kernel" to admit a presentational `src/ui/`.
- **WCAG 2.2 AA stays our job whatever we pick.** No library delivers contrast (1.4.3/1.4.11), visible focus (2.4.7), focus not obscured (2.4.11) or 24×24 targets (2.5.8). These belong in the token values and the `src/ui/` wrappers, and an automated check in the end-to-end suite should guard them.

## For later tickets

- The performance budget only times domain folds. If bundle cost should be enforced, a size check is new Dagger work.
- `docs/design/reference/`, which #72 relies on, is missing from the repo.
- `index.html` and the PWA manifest still use `theme-color` `#1f6f5c` and a white `background_color`. Both need values from the new palette, with separate `theme-color` `<meta>` tags per `media="(prefers-color-scheme: …)"`.
