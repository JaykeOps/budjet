/**
 * Asks the browser not to evict this site's storage. It may say no, and nothing
 * relies on the answer, so the user never hears about it.
 */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}
