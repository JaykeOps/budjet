import type { Page } from "@playwright/test";

export const PICKED_FOLDER = "picked-folder";

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

/** Makes the next use of the picker return another folder, created if needed. */
export async function pickFolderNext(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    const picker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
      window.showDirectoryPicker = picker;
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    };
  }, name);
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

/**
 * Makes the browser treat folder access as lapsed from the next page load, as a
 * phone does once the tab closes. The private file system never really lapses,
 * so this answers the permission questions itself. Asking gives access.
 */
export async function lapseFolderAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let access: PermissionState = "prompt";
    FileSystemHandle.prototype.queryPermission = async () => access;
    FileSystemHandle.prototype.requestPermission = async () => {
      access = "granted";
      return access;
    };
  });
}

/** Makes the next request for folder access end as if the user declined it. */
export async function declineNextFolderAccess(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ask = FileSystemHandle.prototype.requestPermission;
    FileSystemHandle.prototype.requestPermission = async () => {
      FileSystemHandle.prototype.requestPermission = ask;
      return "denied";
    };
  });
}

/** Removes the picked folder, as moving it would. The picker makes a new one. */
export async function removeFolder(page: Page): Promise<void> {
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name, { recursive: true });
  }, PICKED_FOLDER);
}

/** The name and text of every file in a folder's `Crownkeep` subfolder. */
export function filesInFolder(
  page: Page,
  folder: string = PICKED_FOLDER,
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
  }, folder);
}

/**
 * Makes folder access lapse while the app is open, which the private file system
 * never does: touching the folder fails, and asking gives access back.
 */
export async function lapseFolderAccessNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const prototype = FileSystemDirectoryHandle.prototype;
    const getDirectoryHandle = prototype.getDirectoryHandle;
    prototype.getDirectoryHandle = async () => {
      throw new DOMException("Access lapsed", "NotAllowedError");
    };
    FileSystemHandle.prototype.queryPermission = async () => "prompt";
    FileSystemHandle.prototype.requestPermission = async () => {
      prototype.getDirectoryHandle = getDirectoryHandle;
      FileSystemHandle.prototype.queryPermission = async () => "granted";
      return "granted";
    };
  });
}

/** Puts a file in the `Crownkeep` subfolder the way a sync service would. */
export async function deliverFile(
  page: Page,
  fileName: string,
  text: string,
  folder: string = PICKED_FOLDER,
): Promise<void> {
  await page.evaluate(
    async ({ folder, fileName, text }) => {
      const root = await navigator.storage.getDirectory();
      const picked = await root.getDirectoryHandle(folder, { create: true });
      const subfolder = await picked.getDirectoryHandle("Crownkeep", {
        create: true,
      });
      const file = await subfolder.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
    { folder, fileName, text },
  );
}

/**
 * Makes reading stop for good on this page after one whole file. Checking a file
 * and reading it each open it once, so the third opening never finishes.
 */
export async function holdReadingAfterOneFile(page: Page): Promise<void> {
  await page.evaluate(() => {
    const getFile = FileSystemFileHandle.prototype.getFile;
    let opened = 0;
    FileSystemFileHandle.prototype.getFile = function () {
      opened++;
      return opened > 2 ? new Promise(() => {}) : getFile.call(this);
    };
  });
}

/** Empties the Local Copy, leaving the remembered folder. */
export async function clearLocalCopy(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("budjet");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const transaction = opening.result.transaction(
            "records",
            "readwrite",
          );
          transaction.objectStore("records").clear();
          transaction.oncomplete = () => {
            opening.result.close();
            resolve();
          };
        };
      }),
  );
}
