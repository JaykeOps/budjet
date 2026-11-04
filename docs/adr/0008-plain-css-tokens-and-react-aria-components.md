# Plain CSS, design tokens and React Aria Components

The Crownkeep design needs one look across every screen, in dark and light, with widgets that meet WCAG 2.2 AA. We style with plain CSS: tokens are custom properties in one global stylesheet (`src/ui/tokens.css`), each colour written once with `light-dark()`, so the system setting picks the scheme with no JavaScript. Each slice keeps its own styles in private CSS Modules. Widgets native HTML covers poorly come from React Aria Components, wrapped once in `src/ui/` (ADR 0007). Everything else stays a native element. Vite already builds all of this, so ADR 0001 gains no new tool.

## Rules

- The app shell imports `tokens.css`, once. Nothing else does.
- Code uses tokens, not literal colours.
- The stylesheet's element rules sit in `:where()`, so any CSS Module overrides them without a fight over specificity.
- Slices import React Aria only through a wrapper in `src/ui/`.
- Use a native element when it already meets AA. Reach for React Aria when it doesn't.
- Geist is self-hosted from `@fontsource-variable/geist` and precached by the service worker, because the app works offline and contacts no third party.
- React Aria's locales are limited to `en-US` at build time. Translation is out of scope, and the rest would add about 5 KB gzip.

## Considered Options

- **Tailwind with shadcn/ui on React Aria.** The runner-up: the same primitives with a ready-made look. Rejected because its CLI must come from the flake and writes imports through a path alias (ADR 0007 allows none), its helpers add about 8.5 KB gzip, and reviews would read two styling languages.
- **Radix or Base UI primitives.** Smaller, but React Aria has the strongest accessibility testing across screen readers, and that's what we're buying.
- **Native HTML only.** Smallest, but pickers, menus and sheets would each need hand-written keyboard and focus handling.

[The research](https://github.com/JaykeOps/budjet/blob/research/styling-approach/docs/research/styling-and-component-approach.md) has the detail and measurements.

## Consequences

- React Aria is the heaviest option. It installs with no build script, so it passes ADR 0002, but its bytes are paid once by every visitor, and `dagger call performance` has no bundle budget to catch growth.
- Every component's look is hand-written.
- The dark and light schemes can't be forced by a setting without changing how tokens are written. Nothing needs that today.
- `light-dark()` only takes colours, so a percentage or a length can't vary by scheme this way.
