import { useEffect } from "react";
import { currentMonth, type Month, parseMonth } from "./kernel/month";
import { useUrlParameter } from "./url-parameter";

/**
 * The Month being viewed, kept in the address bar (`?month=YYYY-MM`) so
 * reloading or going back keeps it. Without one, it is the current Month. A
 * Month before `firstMonth` can't be viewed: it is replaced by `firstMonth`.
 */
export function useMonthInUrl(firstMonth: Month): [Month, (to: Month) => void] {
  const [parameter, write] = useUrlParameter("month");
  const asked = parseMonth(parameter);
  const viewed = latest(asked ?? currentMonth(), firstMonth);

  useEffect(() => {
    if (asked && asked < firstMonth) write(firstMonth, "replace");
  }, [asked, firstMonth, write]);

  return [viewed, (to) => write(latest(to, firstMonth), "push")];
}

function latest(a: Month, b: Month): Month {
  return a > b ? a : b;
}
