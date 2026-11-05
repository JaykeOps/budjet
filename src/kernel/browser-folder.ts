import type { Folder } from "./data-folder-change-log";
import type { ReturningFolder } from "./folder-on-return";

const SUBFOLDER = "Crownkeep";

/**
 * Opens the folder picker. Cancelling, or declining the browser's prompt, gives
 * nothing; any other failure rejects.
 */
export async function pickFolder(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  try {
    return await window.showDirectoryPicker?.({
      id: "crownkeep",
      mode: "readwrite",
    });
  } catch (error) {
    // Both arrive as AbortError.
    if (error instanceof DOMException && error.name === "AbortError") {
      return undefined;
    }
    throw error;
  }
}

/** A chosen Data Folder as the browser reaches it. Everything goes in its `Crownkeep` subfolder (docs/adr/0009). */
export function browserFolder(handle: FileSystemDirectoryHandle): Folder {
  return {
    async append(fileName, text) {
      const subfolder = await handle.getDirectoryHandle(SUBFOLDER, {
        create: true,
      });
      const file = await subfolder.getFileHandle(fileName, { create: true });
      const { size } = await file.getFile();
      const writable = await file.createWritable({ keepExistingData: true });
      try {
        await writable.seek(size);
        await writable.write(text);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
    },
    async list() {
      const subfolder = await crownkeepSubfolder(handle);
      if (!subfolder) return [];
      const names = [];
      for await (const entry of entries(subfolder)) {
        if (entry.kind === "file") names.push(entry.name);
      }
      return names;
    },
    async stamp(fileName) {
      const { size, lastModified } = await fileIn(handle, fileName);
      return { size, lastModified };
    },
    async read(fileName) {
      return (await fileIn(handle, fileName)).text();
    },
    async remove(fileName) {
      const subfolder = await handle.getDirectoryHandle(SUBFOLDER);
      await subfolder.removeEntry(fileName);
      // Refused while other files remain, which is what's wanted.
      await handle.removeEntry(SUBFOLDER).catch(() => {});
    },
  };
}

async function fileIn(handle: FileSystemDirectoryHandle, fileName: string) {
  const subfolder = await handle.getDirectoryHandle(SUBFOLDER);
  return (await subfolder.getFileHandle(fileName)).getFile();
}

/**
 * The subfolder, or nothing when it doesn't exist yet. Looking inside the chosen
 * folder tells that apart from the folder being gone, which rejects.
 */
async function crownkeepSubfolder(handle: FileSystemDirectoryHandle) {
  try {
    return await handle.getDirectoryHandle(SUBFOLDER);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
      throw error;
    }
    for await (const _ of entries(handle)) break;
    return undefined;
  }
}

function entries(handle: FileSystemDirectoryHandle) {
  // TypeScript's DOM types leave out this async iterator.
  return (
    handle as unknown as { values(): AsyncIterable<FileSystemHandle> }
  ).values();
}

/** A remembered Data Folder on coming back to it. */
export function returningFolder(
  handle: FileSystemDirectoryHandle,
): ReturningFolder {
  return {
    name: handle.name,
    async reach() {
      const access = await handle.queryPermission({ mode: "readwrite" });
      if (access !== "granted") {
        throw new DOMException(
          "Access to the folder lapsed",
          "NotAllowedError",
        );
      }
      // Only touching the folder finds out it's gone. Not looking for the
      // subfolder, whose absence would say nothing about the folder.
      await handle.keys().next();
    },
    async askForAccess() {
      const access = await handle.requestPermission({ mode: "readwrite" });
      return access === "granted";
    },
  };
}
