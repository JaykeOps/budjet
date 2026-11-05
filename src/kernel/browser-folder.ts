import type { Folder } from "./data-folder-change-log";

const SUBFOLDER = "Crownkeep";

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
      const subfolder = await existingSubfolder(handle);
      if (!subfolder) return [];
      const names = [];
      // TypeScript's DOM types leave out this async iterator.
      const entries = (
        subfolder as unknown as { values(): AsyncIterable<FileSystemHandle> }
      ).values();
      for await (const entry of entries) {
        if (entry.kind === "file") names.push(entry.name);
      }
      return names;
    },
    async read(fileName) {
      const subfolder = await handle.getDirectoryHandle(SUBFOLDER);
      const file = await subfolder.getFileHandle(fileName);
      return (await file.getFile()).text();
    },
    async remove(fileName) {
      const subfolder = await handle.getDirectoryHandle(SUBFOLDER);
      await subfolder.removeEntry(fileName);
      // Refused while other files remain, which is what's wanted.
      await handle.removeEntry(SUBFOLDER).catch(() => {});
    },
  };
}

/** Looking must not create the subfolder: its presence is how a device recognises a Budget. */
async function existingSubfolder(handle: FileSystemDirectoryHandle) {
  try {
    return await handle.getDirectoryHandle(SUBFOLDER);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return undefined;
    }
    throw error;
  }
}
