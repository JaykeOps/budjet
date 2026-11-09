/**
 * The browser storage adapter for the Change Log. Storage is opaque: each
 * record is kept as its id plus an opaque payload, with no indexes on its
 * contents, so a later adapter can encrypt records without any slice changing.
 * Every record is read once on opening and then served from memory. The same
 * database keeps this device's id, so records written after a reload carry it.
 */
import {
  type ChangeLog,
  type ChangeRecord,
  createInMemoryChangeLog,
  createSaveStateStore,
  recordsToMerge,
  SAVED,
  SAVING,
} from "./change-log";
import type { FileStamp, FileStamps } from "./folder-checks";

/** The name from before Crownkeep. Renaming it would strand everyone's Local Copy. */
const DATABASE = "budjet";
const RECORDS = "records";
/** A copy of each record not yet written to the Data Folder, so a reload keeps trying. */
const UNWRITTEN = "unwritten";
const DEVICE = "device";
const DEVICE_ID = "id";
const FOLDER_HANDLE = "folder";
const FILE_STAMPS = "file-stamps";
/** Each file a full read has got through, apart from the records until it finishes. */
const FILES_READ = "files-read";

export async function openIndexedDbChangeLog({
  indexedDB = globalThis.indexedDB,
  onGaveWay,
}: {
  indexedDB?: IDBFactory;
  onGaveWay?: () => void;
} = {}): Promise<ChangeLog> {
  return openLocalCopy(await openDatabase(indexedDB, onGaveWay));
}

/**
 * Brings the database up to this version before anything else opens it. A tab
 * running code too old to give way blocks that until it closes, so `onBlocked`
 * lets the app say so instead of showing a blank page.
 */
export async function upgradeDatabase({
  indexedDB = globalThis.indexedDB,
  onBlocked,
}: {
  indexedDB?: IDBFactory;
  onBlocked: () => void;
}): Promise<void> {
  (await openDatabase(indexedDB, undefined, onBlocked)).close();
}

export type LocalCopy = ChangeLog & {
  /**
   * Merges what a check read from the folder, and remembers the stamps of the
   * files it came from in the same transaction, so a file is only ever passed
   * over once its records are stored.
   */
  mergeFromFolder(records: readonly ChangeRecord[], stamps: FileStamps): void;
  /**
   * Adds everything a full read found, all in one transaction with forgetting
   * the files it kept, so a Budget only ever arrives whole.
   */
  finishFullRead(records: readonly ChangeRecord[], stamps: FileStamps): void;
  /**
   * Swaps every record for these in one transaction, along with what's unwritten
   * and what the last checks and reads kept, so a Budget's records never mix
   * with another's and unchanged files are read again if they need to be.
   */
  replaceAll(records: readonly ChangeRecord[], stamps: FileStamps): void;
};

/** A file a full read got through. With no stamp, it wasn't whole, so it's read again. */
export type FileRead = { stamp?: FileStamp; records: ChangeRecord[] };

/**
 * The records in browser storage, served from memory. Appended records are also
 * marked unwritten, in the same transaction, while `holdForFolder` says so or a
 * folder is remembered: another tab may have moved the Budget into one, and this
 * tab is about to reload.
 */
export async function openLocalCopy(
  database: IDBDatabase,
  holdForFolder: () => boolean = () => false,
): Promise<LocalCopy> {
  const stored = await readAllPayloads(database, RECORDS);

  const inMemory = createInMemoryChangeLog();
  inMemory.append(stored.map((payload) => JSON.parse(payload)));

  const saveState = createSaveStateStore();
  let writesUnderway = 0;

  function put(
    records: readonly ChangeRecord[],
    hold: boolean | "if-folder-remembered",
    stamps?: FileStamps,
    finishingFullRead = false,
  ) {
    const transaction = database.transaction(
      [RECORDS, UNWRITTEN, DEVICE, FILES_READ],
      "readwrite",
    );
    if (stamps) transaction.objectStore(DEVICE).put(stamps, FILE_STAMPS);
    if (finishingFullRead) transaction.objectStore(FILES_READ).clear();
    for (const record of records) {
      const payload = toPayload(record);
      transaction.objectStore(RECORDS).put(payload, record.id);
      if (hold === true) {
        transaction.objectStore(UNWRITTEN).put(payload, record.id);
      }
    }
    if (hold === "if-folder-remembered") {
      const remembered = transaction.objectStore(DEVICE).get(FOLDER_HANDLE);
      remembered.onsuccess = () => {
        if (remembered.result === undefined) return;
        for (const record of records) {
          transaction.objectStore(UNWRITTEN).put(toPayload(record), record.id);
        }
      };
    }
    track(transaction);
  }

  function track(transaction: IDBTransaction) {
    writesUnderway++;
    saveState.set(SAVING);
    transaction.oncomplete = () => {
      writesUnderway--;
      if (writesUnderway === 0 && saveState.get() === SAVING) {
        saveState.set(SAVED);
      }
    };
    // An abort means the writes are gone, so this stays until the next open.
    transaction.onabort = () => {
      writesUnderway--;
      console.error("Crownkeep could not save a change", transaction.error);
      saveState.set({ status: "unsaved", reason: "write-failed" });
    };
  }

  return {
    append(records) {
      put(records, holdForFolder() || "if-folder-remembered");
      inMemory.append(records);
    },
    merge(arriving) {
      const added = recordsToMerge(inMemory.readAll(), arriving);
      if (added.length === 0) return;
      put(added, false);
      inMemory.append(added);
    },
    mergeFromFolder(arriving, stamps) {
      const added = recordsToMerge(inMemory.readAll(), arriving);
      put(added, false, stamps);
      if (added.length > 0) inMemory.append(added);
    },
    finishFullRead(arriving, stamps) {
      const added = recordsToMerge(inMemory.readAll(), arriving);
      put(added, false, stamps, true);
      if (added.length > 0) inMemory.append(added);
    },
    replaceAll(records, stamps) {
      const transaction = database.transaction(
        [RECORDS, UNWRITTEN, DEVICE, FILES_READ],
        "readwrite",
      );
      for (const store of [RECORDS, UNWRITTEN, FILES_READ]) {
        transaction.objectStore(store).clear();
      }
      transaction.objectStore(DEVICE).put(stamps, FILE_STAMPS);
      for (const record of records) {
        transaction.objectStore(RECORDS).put(toPayload(record), record.id);
      }
      track(transaction);
      inMemory.replaceAll(records);
    },
    readAll: inMemory.readAll,
    subscribe: inMemory.subscribe,
    saveState: saveState.get,
    subscribeToSaveState: saveState.subscribe,
  };
}

/** Every record in browser storage, by any tab of this browser. */
export async function readAllRecords(
  database: IDBDatabase,
): Promise<ChangeRecord[]> {
  const payloads = await readAllPayloads(database, RECORDS);
  return payloads.map((payload) => JSON.parse(payload));
}

/**
 * Remembers the folder a Budget has just been copied to and, in the same
 * transaction, marks unwritten whatever arrived since, so the switch can't lose it.
 */
export function switchToFolder(
  database: IDBDatabase,
  handle: FileSystemDirectoryHandle,
  copiedIds: readonly string[],
): Promise<void> {
  const copied = new Set(copiedIds);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [DEVICE, RECORDS, UNWRITTEN],
      "readwrite",
    );
    transaction.objectStore(DEVICE).put(handle, FOLDER_HANDLE);
    const reading = transaction.objectStore(RECORDS).openCursor();
    reading.onsuccess = () => {
      const cursor = reading.result;
      if (!cursor) return;
      if (!copied.has(String(cursor.key))) {
        transaction.objectStore(UNWRITTEN).put(cursor.value, cursor.key);
      }
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

/** What the last folder check found, so an unchanged file isn't read again. */
export function readFileStamps(database: IDBDatabase): Promise<FileStamps> {
  return new Promise((resolve, reject) => {
    const reading = database
      .transaction(DEVICE)
      .objectStore(DEVICE)
      .get(FILE_STAMPS);
    reading.onsuccess = () => resolve(reading.result ?? {});
    reading.onerror = () => reject(reading.error);
  });
}

/** The files a full read has got through so far, in any tab or earlier visit. */
export function readFilesRead(
  database: IDBDatabase,
): Promise<Map<string, FileRead>> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, FileRead>();
    const reading = database.transaction(FILES_READ).objectStore(FILES_READ);
    const cursor = reading.openCursor();
    cursor.onsuccess = () => {
      if (!cursor.result) return resolve(files);
      const { stamp, payload } = cursor.result.value;
      files.set(String(cursor.result.key), {
        stamp,
        records: JSON.parse(payload),
      });
      cursor.result.continue();
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export function keepFileRead(
  database: IDBDatabase,
  fileName: string,
  { stamp, records }: FileRead,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILES_READ, "readwrite");
    transaction
      .objectStore(FILES_READ)
      .put({ stamp, payload: JSON.stringify(records) }, fileName);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

export function forgetFilesRead(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILES_READ, "readwrite");
    transaction.objectStore(FILES_READ).clear();
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Marks every record unwritten, so the next write puts the whole Budget in a folder. */
export async function markAllUnwritten(database: IDBDatabase): Promise<void> {
  const payloads = await readAllPayloads(database, RECORDS);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(UNWRITTEN, "readwrite");
    for (const payload of payloads) {
      transaction.objectStore(UNWRITTEN).put(payload, JSON.parse(payload).id);
    }
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Records marked unwritten, by any tab of this browser. */
export async function readUnwrittenRecords(
  database: IDBDatabase,
): Promise<ChangeRecord[]> {
  const payloads = await readAllPayloads(database, UNWRITTEN);
  return payloads.map((payload) => JSON.parse(payload));
}

export function markWritten(
  database: IDBDatabase,
  ids: readonly string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(UNWRITTEN, "readwrite");
    for (const id of ids) transaction.objectStore(UNWRITTEN).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * This device's id, stamped on every record it writes. Created on the first
 * visit and read back on every later one, including offline.
 */
export async function openIndexedDbDeviceId({
  indexedDB = globalThis.indexedDB,
}: {
  indexedDB?: IDBFactory;
} = {}): Promise<string> {
  const database = await openDatabase(indexedDB);
  return new Promise((resolve, reject) => {
    // One readwrite transaction, so two tabs opening at once agree on one id.
    const transaction = database.transaction(DEVICE, "readwrite");
    const store = transaction.objectStore(DEVICE);
    const reading = store.get(DEVICE_ID);
    let deviceId = "";
    reading.onsuccess = () => {
      deviceId = reading.result ?? crypto.randomUUID();
      if (reading.result === undefined) store.put(deviceId, DEVICE_ID);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(deviceId);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Remembers the chosen Data Folder for later visits. */
export async function rememberFolderHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const database = await openDatabase(globalThis.indexedDB);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DEVICE, "readwrite");
    transaction.objectStore(DEVICE).put(handle, FOLDER_HANDLE);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export async function rememberedFolderHandle({
  indexedDB = globalThis.indexedDB,
}: {
  indexedDB?: IDBFactory;
} = {}): Promise<FileSystemDirectoryHandle | undefined> {
  const database = await openDatabase(indexedDB);
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>(
    (resolve, reject) => {
      const reading = database
        .transaction(DEVICE)
        .objectStore(DEVICE)
        .get(FOLDER_HANDLE);
      reading.onsuccess = () => resolve(reading.result);
      reading.onerror = () => reject(reading.error);
    },
  );
  database.close();
  return handle;
}

function toPayload(record: ChangeRecord): string {
  return JSON.stringify(record);
}

/**
 * Opens the database, and gives way when a newer tab needs to upgrade it, since
 * this tab's code doesn't know the new shape. New changes are refused from that
 * moment, so none is shown that can't be saved. A read queued behind every write
 * already underway finishes first, because reloading could abort them. A record
 * the folder hasn't got is still marked, so the reloaded tab goes on to write it.
 */
export function openDatabase(
  indexedDB: IDBFactory,
  onGaveWay: () => void = () => location.reload(),
  onBlocked?: () => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 4);
    request.onupgradeneeded = ({ oldVersion }) => {
      // Each step builds on what earlier versions made, so saved records stay.
      if (oldVersion < 1) {
        // Keyed by record id, which is not part of the payload's contents.
        request.result.createObjectStore(RECORDS);
      }
      if (oldVersion < 2) request.result.createObjectStore(DEVICE);
      if (oldVersion < 3) request.result.createObjectStore(UNWRITTEN);
      if (oldVersion < 4) request.result.createObjectStore(FILES_READ);
    };
    request.onblocked = () => onBlocked?.();
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        const afterWrites = database.transaction([
          ...database.objectStoreNames,
        ]);
        afterWrites.objectStore(RECORDS).count();
        afterWrites.oncomplete = onGaveWay;
        database.close();
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });
}

function readAllPayloads(
  database: IDBDatabase,
  storeName: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName)
      .objectStore(storeName)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
