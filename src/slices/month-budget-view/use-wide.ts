import { useSyncExternalStore } from "react";

/** Wide enough, beside the rail, for the summary column and the table. Same as MonthBudget.module.css. */
const wide = "(min-width: 1180px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(wide);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Rows differ in structure between a list and a table, so width picks which one renders. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(wide).matches);
}
