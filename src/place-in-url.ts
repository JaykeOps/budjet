import { useUrlParameter } from "./url-parameter";

export type Place = "budget" | "activity" | "accounts";

/**
 * Where the user is, kept in the address bar (`?place=activity`) so reloading
 * or going back keeps it. Without one, or with one it doesn't know, it is the
 * Budget: home.
 */
export function usePlace(): Place {
  const [place] = useUrlParameter("place");
  return place === "activity" || place === "accounts" ? place : "budget";
}

/**
 * The address of a place, optionally on one Account and, for Activity, one
 * Month, from the address the user is at now. The Budget's Month stays, so
 * leaving the Budget doesn't lose it.
 */
export function placeAddress(
  place: Place,
  accountId?: string,
  statementMonth?: string,
): string {
  const url = new URL(window.location.href);
  if (place === "budget") url.searchParams.delete("place");
  else url.searchParams.set("place", place);
  if (accountId) url.searchParams.set("account", accountId);
  else url.searchParams.delete("account");
  if (statementMonth) url.searchParams.set("statement", statementMonth);
  else url.searchParams.delete("statement");
  return `${url.pathname}${url.search}`;
}
