import { useSyncExternalStore } from "react";

let offered = false;
const listeners = new Set<() => void>();

function setOffered(value: boolean) {
  offered = value;
  for (const listener of listeners) listener();
}

// Listening from the moment this loads, because the browser only says it once.
window.addEventListener("beforeinstallprompt", () => setOffered(true));
window.addEventListener("appinstalled", () => setOffered(false));

/** Whether this browser offers to install Crownkeep. */
export function useInstallOffered(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => offered,
  );
}
