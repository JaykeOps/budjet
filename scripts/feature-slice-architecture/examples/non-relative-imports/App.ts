// @ts-expect-error A baseUrl-style import of the source tree.
export { zero } from "kernel/money";
export { useId } from "react";
// @ts-expect-error An import from the project root.
export { card as box } from "src/ui/Card.js";
// @ts-expect-error An alias of the source directory.
export { card } from "@/ui/Card";
// @ts-expect-error A tilde alias of the source directory.
export { accountType } from "~/slices/accounts/helpers";
// @ts-expect-error A root-relative import, as Vite would resolve it.
export { zero as nothing } from "/src/kernel/money";
