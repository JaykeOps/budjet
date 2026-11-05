import type { Folder } from "./data-folder-change-log";

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
