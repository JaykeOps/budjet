/**
 * A Data Folder in memory, for tests. It behaves like the real thing where that
 * loses records: an append reads the file's size, waits, then replaces the file
 * with what it read plus its text, so overlapping appends overwrite each other
 * and still report success.
 */
import type { Folder, OneTabAtATime } from "./data-folder-change-log";

export type InMemoryFolder = Folder & {
  readonly files: Map<string, string>;
  /** What every browser sharing this folder queues behind, like a Web Lock. */
  oneTabAtATime: OneTabAtATime;
  /** Makes each later append fail with this error's name, until cleared. */
  failWith(errorName: string | undefined): void;
  appends(): number;
};

export function createInMemoryFolder(): InMemoryFolder {
  const files = new Map<string, string>();
  let failure: string | undefined;
  let appends = 0;
  let lockHeld: Promise<unknown> = Promise.resolve();

  return {
    files,
    oneTabAtATime(work) {
      const running = lockHeld.then(work, work);
      lockHeld = running.catch(() => {});
      return running;
    },
    failWith(errorName) {
      failure = errorName;
    },
    appends: () => appends,
    async append(fileName, text) {
      const before = files.get(fileName) ?? "";
      await new Promise((resolve) => setTimeout(resolve));
      if (failure) throw new DOMException("In-memory failure", failure);
      files.set(fileName, before + text);
      appends++;
    },
    list: async () => [...files.keys()],
    read: async (fileName) => files.get(fileName) ?? "",
    async remove(fileName) {
      files.delete(fileName);
    },
  };
}
