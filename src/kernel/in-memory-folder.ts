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
  /** Puts a file in place the way a sync service does. */
  deliver(fileName: string, text: string, lastModified?: number): void;
  /** Makes reading this one file fail with this error's name, until cleared. */
  failReading(fileName: string, errorName: string | undefined): void;
  /** The files read, and the files whose date and size were checked, since the last clear. */
  reads(): string[];
  stamps(): string[];
  clearReads(): void;
};

export function createInMemoryFolder(): InMemoryFolder {
  const files = new Map<string, string>();
  let failure: string | undefined;
  let appends = 0;
  const unreadable = new Map<string, string>();
  const modified = new Map<string, number>();
  let reads: string[] = [];
  let stamps: string[] = [];
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
      modified.set(fileName, Date.now());
      appends++;
    },
    async list() {
      if (failure) throw new DOMException("In-memory failure", failure);
      return [...files.keys()];
    },
    async read(fileName) {
      reads.push(fileName);
      const error = failure ?? unreadable.get(fileName);
      if (error) throw new DOMException("In-memory failure", error);
      return files.get(fileName) ?? "";
    },
    async stamp(fileName) {
      stamps.push(fileName);
      const error = failure ?? unreadable.get(fileName);
      if (error) throw new DOMException("In-memory failure", error);
      return {
        size: files.get(fileName)?.length ?? 0,
        lastModified: modified.get(fileName) ?? 0,
      };
    },
    reads: () => reads,
    stamps: () => stamps,
    clearReads() {
      reads = [];
      stamps = [];
    },
    failReading(fileName, errorName) {
      if (errorName) unreadable.set(fileName, errorName);
      else unreadable.delete(fileName);
    },
    deliver(fileName, text, lastModified = Date.now()) {
      files.set(fileName, text);
      modified.set(fileName, lastModified);
    },
  };
}
