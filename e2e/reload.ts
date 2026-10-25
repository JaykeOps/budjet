import type { Page } from "@playwright/test";

/**
 * Reloads the page once every change made so far is saved. The app shows a
 * change before browser storage has committed it, so a bare `page.reload()`
 * can drop the last one. A read of the records waits behind every write
 * already queued on them (IndexedDB runs transactions on the same store in
 * order), so once it finishes they are all saved.
 */
export async function reloadWhenSaved(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("budjet");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const reading = database
            .transaction("records")
            .objectStore("records")
            .count();
          reading.onerror = () => reject(reading.error);
          reading.onsuccess = () => {
            database.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
}
