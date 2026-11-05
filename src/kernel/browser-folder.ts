import type { Folder } from "./data-folder-change-log";
import type { ReturningFolder } from "./folder-on-return";

/** A chosen Data Folder as the browser reaches it. Everything goes in its `Crownkeep` subfolder (docs/adr/0009). */
export function browserFolder(handle: FileSystemDirectoryHandle): Folder {
  return {
    async append(fileName, text) {
      const subfolder = await handle.getDirectoryHandle("Crownkeep", {
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
  };
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
