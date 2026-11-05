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
  markWritten,
  openDatabase,
  openLocalCopy,
  readAllRecords,
  readUnwrittenRecords,
  switchToFolder,
} from "./indexed-db-change-log";

/** The narrow view of a Data Folder this adapter needs. Failures reject with the browser's `DOMException`s. */
export type Folder = {
  /** Adds text to the end of a file in the `Crownkeep` subfolder, creating either if needed. */
  append(fileName: string, text: string): Promise<void>;
  /** The names of the files in the subfolder, without creating it. */
  list(): Promise<string[]>;
  read(fileName: string): Promise<string>;
  remove(fileName: string): Promise<void>;
};

/** Runs work while no other tab of this browser is running theirs. */
export type OneTabAtATime = <Result>(
  work: () => Promise<Result>,
) => Promise<Result>;

/** Anything but `moved` leaves the Budget in browser storage as it was. */
export type MoveOutcome = "moved" | "holds-a-budget" | "failed";

export type DataFolderChangeLog = ChangeLog & {
  /** Writes from now on go to this folder, along with any held records. */
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
};

export async function openDataFolderChangeLog({
  indexedDB = globalThis.indexedDB,
  folder: initialFolder,
  oneTabAtATime = webLock,
  onGaveWay,
}: {
  indexedDB?: IDBFactory;
  /** Absent for a Budget not in a folder, which stays in browser storage. */
  folder?: Folder;
  oneTabAtATime?: OneTabAtATime;
  /** What to do after giving way to a newer tab. Reloads the page by default. */
  onGaveWay?: () => void;
} = {}): Promise<DataFolderChangeLog> {
  let folder = initialFolder;
  const database = await openDatabase(indexedDB, onGaveWay);
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

  /** Only ever one running per tab: changes arriving meanwhile wait for the next pass. */
  async function writeWhileThereIsMore(to: Folder) {
    writing = true;
    showSaveState();
    try {
      do {
        writeAgain = false;
        await oneTabAtATime(() => writeUnwritten(to));
        failure = undefined;
      } while (writeAgain);
    } catch (error) {
      failure = unsavedReason(error);
    }
    writing = false;
    showSaveState();
  }

  function startWriting() {
    if (!folder) return;
    if (writing) writeAgain = true;
    else void writeWhileThereIsMore(folder);
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
      startWriting();
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
}

/** One file per device per Month, the Month coming from the record's own wall time. */
function byFile(records: readonly ChangeRecord[]) {
  const files = new Map<string, ChangeRecord[]>();
  for (const record of [...records].sort(compareRecords)) {
    const month = new Date(record.timestamp.wallTime).toISOString().slice(0, 7);
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
