/**
 * The Change Log for a Budget kept in a Data Folder (docs/adr/0009). It opens
 * from the Local Copy in browser storage and writes every new record to the
 * folder behind the scenes, so `append` stays synchronous for the UI. Until its
 * write finishes, a record stays marked unwritten in the Local Copy, so a reload
 * or a new session keeps trying.
 */
import {
  type ChangeLog,
  type ChangeRecord,
  compareRecords,
  createSaveStateStore,
  SAVED,
  SAVING,
  type UnsavedReason,
} from "./change-log";
import {
  type CheckScope,
  type FileStamp,
  type FileStamps,
  parseRecords,
  readChanges,
  sameStamp,
} from "./folder-checks";
import {
  type FileRead,
  forgetFilesRead,
  keepFileRead,
  markAllUnwritten,
  markWritten,
  openDatabase,
  openLocalCopy,
  readAllRecords,
  readFileStamps,
  readFilesRead,
  readUnwrittenRecords,
  switchToFolder,
} from "./indexed-db-change-log";

/** The narrow view of a Data Folder this adapter needs. Failures reject with the browser's `DOMException`s. */
export type Folder = {
  /** Adds text to the end of a file in the `Crownkeep` subfolder, creating either if needed. */
  append(fileName: string, text: string): Promise<void>;
  /**
   * The name of every file in the `Crownkeep` subfolder, which is none when
   * there's no subfolder yet. Rejects if the chosen folder itself is gone.
   */
  list(): Promise<string[]>;
  /** A file's date and size. Far cheaper than reading it on a phone. */
  stamp(fileName: string): Promise<FileStamp>;
  /** A file's whole text. */
  read(fileName: string): Promise<string>;
  /** Deletes a file, and the subfolder once it's empty. */
  remove(fileName: string): Promise<void>;
};

/** Runs work while no other tab of this browser is running theirs. */
export type OneTabAtATime = <Result>(
  work: () => Promise<Result>,
) => Promise<Result>;

/** Anything but `moved` leaves the Budget in browser storage as it was. */
export type MoveOutcome = "moved" | "holds-a-budget" | "failed";

export type DataFolderChangeLog = ChangeLog & {
  /** Writes from now on go to this newly chosen folder, along with any held records. */
  keepInFolder(folder: Folder): void;
  /**
   * Copies every record into an empty folder, reads them back to check, then
   * keeps the Budget there. The browser's records stay as the Local Copy.
   */
  moveIntoFolder(
    folder: Folder,
    handle: FileSystemDirectoryHandle,
  ): Promise<MoveOutcome>;
  inFolder(): boolean;
  /**
   * The same, for the folder this Budget was already in, opened without it until
   * the user is back. What the last check read there still counts.
   */
  returnToFolder(folder: Folder): void;
  /**
   * Merges what the folder holds that this Change Log doesn't. It stops between
   * files once `keepGoing` says so, and says whether it got through the folder.
   * Finding a different Budget merges nothing, stops using the folder and calls
   * `onTwoBudgets`.
   */
  checkFolder(scope: CheckScope, keepGoing?: () => boolean): Promise<boolean>;
  /**
   * Opens a Budget by reading all of this folder, for a device with no Budget in
   * its Local Copy. Only if it opens one is the Change Log in this folder. Nothing shows until every file is in: each is kept apart as
   * it's read, so leaving resumes. A file that can't be read yet is tried again
   * after the rest, for as long as it takes. Rejects if the folder can't be listed.
   */
  readFolderInFull(
    chosen: Folder,
    reading: FullRead,
  ): Promise<"opened" | "no-budget" | "two-budgets">;
  /** Whether a full read left files behind, so there's one to resume. */
  fullReadUnderway(): Promise<boolean>;
  /** Drops those files, because they came from a folder no longer chosen. */
  forgetFullRead(): Promise<void>;
  /**
   * What a chosen folder holds, checked before any of it enters the Local Copy.
   * It reads only as far as the first `BudgetCreated`. A file that can't be read
   * yet is tried again, because it may be the one that holds it.
   */
  whatFolderHolds(
    chosen: Folder,
    waitToRetry?: () => Promise<void>,
  ): Promise<"this-budget" | "another-budget" | "no-budget">;
  /** Whether any tab has records the folder hasn't got. */
  hasUnsavedChanges(): Promise<boolean>;
  /**
   * Swaps the Budget in the Local Copy for the one in this folder and keeps it
   * there, once all of it is read. Anything but `replaced` changes nothing, and
   * a folder that can't be listed rejects. The old Budget stays in its folder.
   * `unsaved` refuses because of records that would be lost, unless discarding
   * them was asked for.
   */
  replaceWithFolder(
    chosen: Folder,
    replacing: Pick<FullRead, "onProgress" | "waitToRetry"> & {
      discardUnsaved?: boolean;
    },
  ): Promise<"replaced" | "unsaved" | "no-budget" | "two-budgets">;
  /** Keeps the Budget in a folder with none, writing all of it there. */
  putBudgetIn(chosen: Folder): Promise<void>;
  /** Empties the Local Copy, ready for setup to write a new Budget to this folder. */
  startNewBudget(chosen: Folder): void;
};

export type FullRead = {
  onProgress(progress: FullReadProgress): void;
  /** How long to wait before trying unreadable files again. */
  waitToRetry?: () => Promise<void>;
};

export type FullReadProgress = { read: number; of: number };

const FULL_READ_RETRY_AFTER = 5000;

export async function openDataFolderChangeLog({
  indexedDB = globalThis.indexedDB,
  folder: initialFolder,
  oneTabAtATime = webLock,
  onGaveWay,
  budgetIds,
  onTwoBudgets,
}: {
  indexedDB?: IDBFactory;
  /** Absent for a Budget not in a folder, which stays in browser storage. */
  folder?: Folder;
  oneTabAtATime?: OneTabAtATime;
  /** What to do after giving way to a newer tab. Reloads the page by default. */
  onGaveWay?: () => void;
  /** The id on each `BudgetCreated` among these records, which is the Budget's identity. */
  budgetIds: (records: readonly ChangeRecord[]) => readonly string[];
  /** A check found a different Budget's records in the folder this Budget is kept in. */
  onTwoBudgets: () => void;
}): Promise<DataFolderChangeLog> {
  let folder = initialFolder;
  const database = await openDatabase(indexedDB, onGaveWay);
  // Read before the records: a stamp newer than them could hide a file they lack.
  let stamps = await readFileStamps(database);
  const localCopy = await openLocalCopy(database, () => folder !== undefined);
  const saveState = createSaveStateStore();
  let writing = false;
  let writeAgain = false;
  let failure: UnsavedReason | undefined;

  const showSaveState = () => {
    const local = localCopy.saveState();
    if (local.status === "unsaved") saveState.set(local);
    else if (failure) saveState.set({ status: "unsaved", reason: failure });
    else if (writing || local.status === "saving") saveState.set(SAVING);
    else saveState.set(SAVED);
  };
  localCopy.subscribeToSaveState(showSaveState);

  /**
   * Writes everything marked unwritten, in this tab or another. Holding the lock
   * through the whole write means two tabs never touch a file at once, and
   * whatever a burst left behind goes in one write per file.
   */
  async function writeUnwritten(to: Folder) {
    const records = await readUnwrittenRecords(database);
    for (const [fileName, inFile] of byFile(records)) {
      await to.append(fileName, inFile.map(toLine).join(""));
      await markWritten(
        database,
        inFile.map(({ id }) => id),
      );
    }
  }

  /**
   * Only ever one running per tab: changes arriving meanwhile wait for the next
   * pass, as does a folder given meanwhile, even if this pass fails.
   */
  async function writeWhileThereIsMore() {
    writing = true;
    showSaveState();
    writeAgain = true;
    while (writeAgain && folder) {
      writeAgain = false;
      const to = folder;
      try {
        await oneTabAtATime(() => writeUnwritten(to));
        failure = undefined;
      } catch (error) {
        failure = unsavedReason(error);
      }
    }
    writing = false;
    showSaveState();
  }

  function startWriting() {
    if (!folder) return;
    if (writing) writeAgain = true;
    else void writeWhileThereIsMore();
  }

  async function move(
    chosen: Folder,
    handle: FileSystemDirectoryHandle,
  ): Promise<MoveOutcome> {
    // From storage, not memory: another tab may have added records this one hasn't seen.
    const records = await readAllRecords(database);
    const ours = new Set(records.map(toLine));
    const found = await linesIn(chosen);
    // Lines that are all ours can only be what an earlier try left behind.
    if (found.some((line) => !ours.has(line))) return "holds-a-budget";

    const files = byFile(records);
    const before = folder;
    try {
      for (const [fileName, inFile] of files) {
        await chosen.append(fileName, inFile.map(toLine).join(""));
      }
      const readBack = new Set(await linesIn(chosen));
      if ([...ours].some((line) => !readBack.has(line))) {
        throw new Error("The folder didn't give back what was written to it");
      }
      // In one tick with starting the switch, so a change is either in what the
      // switch reads or marked unwritten by its own append.
      folder = chosen;
      await switchToFolder(
        database,
        handle,
        records.map(({ id }) => id),
      );
    } catch (error) {
      folder = before;
      await removeAll(chosen, [...files.keys()]);
      throw error;
    }
    startWriting();
    return "moved";
  }

  startWriting();

  /** With a Budget here, any other id is a second one. With none, two ids are. */
  const bringsSecondBudget = (arriving: readonly ChangeRecord[]) => {
    const held = budgetIds(localCopy.readAll());
    const all = new Set([...held, ...budgetIds(arriving)]);
    return all.size > Math.max(new Set(held).size, 1);
  };

  /** Reads every file into the kept store, retrying what can't be read yet. */
  async function readInFull(
    chosen: Folder,
    { onProgress, waitToRetry = waitBeforeRetrying }: FullRead,
  ) {
    const kept = await readFilesRead(database);
    let names = await chosen.list();
    while (names.length > 0) {
      const unreadable = await readEachFile(chosen, names, kept, onProgress);
      if (!unreadable) break;
      await waitToRetry();
      names = await chosen.list();
    }
    return {
      records: names.flatMap((name) => (kept.get(name) as FileRead).records),
      stamps: stampsOf(names, kept),
    };
  }

  return {
    ...localCopy,
    append(records) {
      localCopy.append(records);
      startWriting();
    },
    saveState: saveState.get,
    subscribeToSaveState: saveState.subscribe,
    keepInFolder(chosen) {
      folder = chosen;
      stamps = {};
      localCopy.mergeFromFolder([], stamps);
      startWriting();
    },
    returnToFolder(remembered) {
      folder = remembered;
      startWriting();
    },
    async checkFolder(scope, keepGoing = () => true) {
      if (!folder) return false;
      const before = stamps;
      const changes = await readChanges(folder, scope, stamps, keepGoing);
      // The folder changed during the check, so what it found belongs to the old one.
      if (stamps !== before) return false;
      if (bringsSecondBudget(changes.records)) {
        // Unstamped, so the next open finds the same and stops again.
        folder = undefined;
        onTwoBudgets();
        return false;
      }
      stamps = changes.stamps;
      if (changes.records.length > 0 || stamps !== before) {
        localCopy.mergeFromFolder(changes.records, stamps);
      }
      return changes.finished;
    },
    async readFolderInFull(chosen, reading) {
      const found = await readInFull(chosen, reading);
      const held = new Set(budgetIds(found.records));
      if (held.size !== 1) {
        await forgetFilesRead(database);
        return held.size === 0 ? "no-budget" : "two-budgets";
      }
      folder = chosen;
      stamps = found.stamps;
      localCopy.finishFullRead(found.records, stamps);
      startWriting();
      return "opened";
    },
    async fullReadUnderway() {
      return (await readFilesRead(database)).size > 0;
    },
    forgetFullRead: () => forgetFilesRead(database),
    async whatFolderHolds(chosen, waitToRetry = waitBeforeRetrying) {
      const held = new Set(budgetIds(localCopy.readAll()));
      while (true) {
        let unreadable = false;
        for (const name of await chosen.list()) {
          try {
            const { records } = parseRecords(await chosen.read(name));
            const found = budgetIds(records);
            if (found.length > 0) {
              return found.every((id) => held.has(id))
                ? "this-budget"
                : "another-budget";
            }
          } catch {
            unreadable = true;
          }
        }
        if (!unreadable) return "no-budget";
        await waitToRetry();
      }
    },
    async hasUnsavedChanges() {
      return (await readUnwrittenRecords(database)).length > 0;
    },
    async replaceWithFolder(chosen, { discardUnsaved = false, ...reading }) {
      // Any kept files came from a read this one isn't carrying on with.
      await forgetFilesRead(database);
      const found = await readInFull(chosen, reading);
      const held = new Set(budgetIds(found.records));
      if (held.size !== 1) {
        await forgetFilesRead(database);
        return held.size === 0 ? "no-budget" : "two-budgets";
      }
      // Asked again here: another tab may have held a change during the read.
      if (
        !discardUnsaved &&
        (await readUnwrittenRecords(database)).length > 0
      ) {
        await forgetFilesRead(database);
        return "unsaved";
      }
      folder = chosen;
      stamps = found.stamps;
      failure = undefined;
      localCopy.replaceAll(found.records, stamps);
      showSaveState();
      return "replaced";
    },
    async putBudgetIn(chosen) {
      await markAllUnwritten(database);
      failure = undefined;
      folder = chosen;
      stamps = {};
      localCopy.mergeFromFolder([], stamps);
      startWriting();
    },
    startNewBudget(chosen) {
      folder = chosen;
      stamps = {};
      failure = undefined;
      localCopy.replaceAll([], stamps);
      showSaveState();
    },
    async moveIntoFolder(chosen, handle) {
      try {
        return await oneTabAtATime(() => move(chosen, handle));
      } catch (error) {
        console.error("Crownkeep could not move into the folder", error);
        return "failed";
      }
    },
    inFolder: () => folder !== undefined,
  };

  /** Says whether any file couldn't be read this time. */
  async function readEachFile(
    from: Folder,
    names: readonly string[],
    kept: Map<string, FileRead>,
    onProgress: FullRead["onProgress"],
  ) {
    let unreadable = false;
    const showCount = () =>
      onProgress({
        read: names.filter((name) => kept.has(name)).length,
        of: names.length,
      });
    showCount();
    for (const name of names) {
      try {
        // Stamped before reading: a change in between only means another read.
        const stamp = await from.stamp(name);
        const known = kept.get(name)?.stamp;
        if (known && sameStamp(known, stamp)) continue;
        const file = parseRecords(await from.read(name));
        const fileRead = {
          stamp: file.whole ? stamp : undefined,
          records: file.records,
        };
        await keepFileRead(database, name, fileRead);
        kept.set(name, fileRead);
        showCount();
      } catch {
        unreadable = true;
      }
    }
    return unreadable;
  }
}

function stampsOf(names: readonly string[], kept: Map<string, FileRead>) {
  const found: FileStamps = {};
  for (const name of names) {
    const stamp = kept.get(name)?.stamp;
    if (stamp) found[name] = stamp;
  }
  return found;
}

function waitBeforeRetrying() {
  return new Promise<void>((resolve) =>
    setTimeout(resolve, FULL_READ_RETRY_AFTER),
  );
}

/**
 * One file per device per Month, the Month coming from the record's own wall
 * time. A record placed earlier in the log goes by when it was written instead:
 * other devices' quick checks skip a file that has gone quiet, so a new line in
 * an old Month's file would sit unread.
 */
function byFile(records: readonly ChangeRecord[]) {
  const files = new Map<string, ChangeRecord[]>();
  for (const record of [...records].sort(compareRecords)) {
    const month = new Date(record.writtenAt ?? record.timestamp.wallTime)
      .toISOString()
      .slice(0, 7);
    const fileName = `${record.deviceId}-${month}.jsonl`;
    files.set(fileName, [...(files.get(fileName) ?? []), record]);
  }
  return files;
}

function toLine(record: ChangeRecord): string {
  return `${JSON.stringify(record)}\n`;
}

/** Every line of every file, ending in a newline as `toLine` makes them. */
async function linesIn(folder: Folder): Promise<string[]> {
  const lines = [];
  for (const fileName of await folder.list()) {
    const text = await folder.read(fileName);
    lines.push(
      ...text
        .split("\n")
        .filter(Boolean)
        .map((line) => `${line}\n`),
    );
  }
  return lines;
}

/** Best effort, since the failure being cleaned up after may stop this too. */
async function removeAll(folder: Folder, fileNames: readonly string[]) {
  for (const fileName of fileNames) {
    await folder.remove(fileName).catch(() => {});
  }
}

function unsavedReason(error: unknown): UnsavedReason {
  const name = error instanceof DOMException ? error.name : undefined;
  if (name === "NotAllowedError") return "access-lapsed";
  if (name === "NotFoundError") return "folder-gone";
  console.error("Crownkeep could not write to the folder", error);
  return "write-failed";
}

function webLock<Result>(work: () => Promise<Result>): Promise<Result> {
  return navigator.locks.request("crownkeep-folder-writes", work);
}
