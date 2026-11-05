import type { Page } from "@playwright/test";

const PICKED_FOLDER = "picked-folder";

/**
 * Makes `showDirectoryPicker` return a folder in the browser's private file
 * system instead of opening a dialog no test can answer. It applies to every
 * tab of the test's browser, which all get the same folder.
 */
export async function fakeFolderPicker(page: Page): Promise<void> {
  await page.context().addInitScript((name) => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    };
  }, PICKED_FOLDER);
}

/** Makes the next use of the picker end as if the user cancelled it. */
export async function cancelNextFolderPicker(page: Page): Promise<void> {
  await page.evaluate(() => {
    const picker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
      window.showDirectoryPicker = picker;
      throw new DOMException("The user aborted a request.", "AbortError");
    };
  });
}

/** Leaves a record from another device in the picked folder's `Crownkeep` subfolder. */
export async function putAnotherBudgetInFolder(page: Page): Promise<void> {
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const picked = await root.getDirectoryHandle(name, { create: true });
    const subfolder = await picked.getDirectoryHandle("Crownkeep", {
      create: true,
    });
    const file = await subfolder.getFileHandle("other-device-2026-01.jsonl", {
      create: true,
    });
    const writable = await file.createWritable();
    await writable.write('{"id":"theirs"}\n');
    await writable.close();
  }, PICKED_FOLDER);
}

/** The name and text of every file in the picked folder's `Crownkeep` subfolder. */
export function filesInFolder(
  page: Page,
): Promise<{ name: string; text: string }[]> {
  return page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const picked = await root.getDirectoryHandle(name);
    const subfolder = await picked.getDirectoryHandle("Crownkeep");
    const files = [];
    // TypeScript's DOM types leave out this async iterator.
    const entries = (
      subfolder as unknown as {
        values(): AsyncIterable<FileSystemFileHandle>;
      }
    ).values();
    for await (const file of entries) {
      files.push({
        name: file.name,
        text: await (await file.getFile()).text(),
      });
    }
    return files;
  }, PICKED_FOLDER);
}
