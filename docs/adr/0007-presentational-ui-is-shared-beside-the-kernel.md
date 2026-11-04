# Presentational UI is shared beside the kernel

ADR 0005 keeps shared code to a thin kernel of value types and the Change Log, and each slice owns its UI. The Crownkeep design needs one look across every screen: the same tokens, Buttons, Cards, Sheets and Month selector. Copying them into each slice lets them drift, and a slice can't import another slice's private UI. So `src/ui/` sits beside the kernel and holds presentational code only: tokens, primitives, wrapped React Aria widgets, and widgets built on kernel value types, such as MoneyText. This amends ADR 0005's "shared code is a thin kernel": the kernel stays as it was, and the domain still lives in slices.

## Rules

- `src/ui/` imports only the kernel and itself. It holds no Change Log hooks and no queries, so nothing in it knows a domain rule.
- Slice UI and the app shell may import it. The kernel and every `records.ts` never do, so records stay leaves any slice can read.
- The kernel imports only the kernel.
- A component moves into `src/ui/` when a second slice needs it, not before.
- Imports inside the source tree are relative, and the TypeScript config has no path aliases. The folders an import crosses stay visible, and the check reads boundaries from paths alone.
- The feature-slice check sorts every path into kernel, ui, slice or app shell and enforces these rules, as a Dagger check, alongside ADR 0005's.

## Considered Options

- **Presentational code in the kernel.** Rejected: the kernel is what records may import, so React and widgets would come within reach of every record, and it would no longer be thin.
- **A UI slice.** Rejected: slices are features that may hold records, commands and queries, and importing its `index.ts` would add a query dependency from every other slice.
- **Each slice keeping its own copies.** Rejected: copies drift, which is what one design language must avoid.

## Consequences

- `src/ui/` will attract anything two slices happen to share. The boundary keeps out domain logic, and the second-slice rule keeps out speculation; both still take judgement in review.
- Relative imports get long in deep folders, which we accept in exchange for a boundary a script can read.
