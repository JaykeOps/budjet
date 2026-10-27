import { useEffect, useSyncExternalStore } from "react";
import { currentMonth, type Month, parseMonth } from "./kernel/month";

const parameter = "month";

/**
 * The Month being viewed, kept in the address bar (`?month=YYYY-MM`) so
 * reloading or going back keeps it. Without one, it is the current Month. A
 * Month before `firstMonth` can't be viewed: it is replaced by `firstMonth`.
 */
export function useMonthInUrl(firstMonth: Month): [Month, (to: Month) => void] {
  const asked = useSyncExternalStore(subscribe, monthInUrl);
  const viewed = latest(asked ?? currentMonth(), firstMonth);

  useEffect(() => {
    if (asked && asked < firstMonth) writeMonth(firstMonth, "replace");
  }, [asked, firstMonth]);

  return [viewed, (to) => writeMonth(latest(to, firstMonth), "push")];
}

function monthInUrl(): Month | undefined {
  return parseMonth(new URLSearchParams(window.location.search).get(parameter));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function writeMonth(month: Month, how: "push" | "replace"): void {
  const url = new URL(window.location.href);
  url.searchParams.set(parameter, month);
  if (how === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  // pushState and replaceState don't fire popstate; tell subscribers ourselves.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function latest(a: Month, b: Month): Month {
  return a > b ? a : b;
}
