import { expect, type Page } from "@playwright/test";

/**
 * Reloads the page once every change made so far is saved, in browser storage
 * and in the Data Folder. The app shows a change before either has it, so a bare
 * `page.reload()` can drop the last one, or interrupt writing it.
 */
export async function reloadWhenSaved(page: Page): Promise<void> {
  await folderWritesFinished(page);
  await page.reload();
}

/**
 * Waits for the Data Folder to catch up. A read waits behind every write already
 * queued on the store (IndexedDB runs them in order), so it sees every change
 * made so far, marked until its folder write has finished.
 */
export async function folderWritesFinished(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const opening = indexedDB.open("budjet");
            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const database = opening.result;
              const reading = database
                .transaction("unwritten")
                .objectStore("unwritten")
                .count();
              reading.onerror = () => reject(reading.error);
              reading.onsuccess = () => {
                database.close();
                resolve(reading.result);
              };
            };
          }),
      ),
    )
    .toBe(0);
}
