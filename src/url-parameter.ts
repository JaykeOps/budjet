import { useCallback, useSyncExternalStore } from "react";

/**
 * One parameter of the address bar's query string (`?name=value`), so what
 * the user is looking at survives a reload and Back returns to what they
 * looked at before. Null when the address has none.
 */
export function useUrlParameter(
  name: string,
): [string | null, (value: string, how: "push" | "replace") => void] {
  const value = useSyncExternalStore(subscribe, () =>
    new URLSearchParams(window.location.search).get(name),
  );
  const write = useCallback(
    (to: string, how: "push" | "replace") => writeParameter(name, to, how),
    [name],
  );
  return [value, write];
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function writeParameter(
  name: string,
  value: string,
  how: "push" | "replace",
): void {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  if (how === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  // pushState and replaceState don't fire popstate; tell subscribers ourselves.
  window.dispatchEvent(new PopStateEvent("popstate"));
}
