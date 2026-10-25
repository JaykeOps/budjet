# Feature slices, not a layered core

budjet is organised as feature slices (Budget Setup, Accounts, Transactions, Transfers, Categories, Assignments, Budget Totals, Month Budget view), each owning its UI, commands, change record types, queries and tests, instead of UI, domain and storage layers shared by every feature. We want a change to land in one slice without rippling through the rest. Shared code is a thin kernel: the Money and Month value types, and the Change Log, the append-only store of change records (ADR 0004) that is the only home of domain state. No global client store (Redux, Zustand, Jotai) holds a second copy of it.

## Rules

- A slice exports its public queries and the hooks that wrap them. Public queries are plain functions over change records and are the only contract one slice may call on another; hooks subscribe to the Change Log with React's `useSyncExternalStore`.
- A slice may read the change records another slice publishes and call its public queries, never its commands or internals. Query dependencies point one way with no cycles, and a Dagger check enforces both.
- Only the app shell may call commands from more than one slice, to compose flows such as creating a Budget.
- Published record types are versioned contracts: changing one is a cross-slice change. A slice publishes beside them the fold that reads them as they now stand (most recent edit wins, ADR 0004), so every reader agrees on what the records mean. Records and their folds import only the kernel, which keeps them leaves that any slice can read without adding a query dependency.
- Each money term (Account balance, Available, Ready to Assign) is calculated in exactly one place.

## Considered Options

- **A layered core** with every budget rule in one domain module. Rejected: every feature change touches the shared layer.
- **Slices recalculating what they need**, e.g. Categories working out Available itself. Rejected: two calculations of one term drift, and the user sees two numbers that disagree.
- **A shared ledger slice** under every feature, owning the money records and their folds, to break the cycles between slices that read Transactions and slices that Transactions reads. Rejected: it is a layered core again, and records would leave the slices that write them. Leaf records with their own folds break the same cycles.
- **A global client store** for domain data. Rejected: the Change Log already is the store; a second copy can drift and is one more thing to clear when the Budget locks.

## Consequences

- The money calculations are where slices depend on each other. They live in Budget Totals, a slice with no UI, so that the Categories and Month Budget view slices can both use them without depending on each other. Budget Totals will attract new queries; adding one is a design decision, not a convenience.
- Features cost more boilerplate up front than a single module would.
- Storage holds records as opaque payloads and never indexes their contents, so the Change Log adapter can later encrypt them without any slice changing.
