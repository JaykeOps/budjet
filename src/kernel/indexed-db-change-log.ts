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

const DATABASE = "budjet";
const RECORDS = "records";
/** A copy of each record not yet written to the Data Folder, so a reload keeps trying. */
const UNWRITTEN = "unwritten";
const DEVICE = "device";
const DEVICE_ID = "id";
const FOLDER_HANDLE = "folder";

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

/**
 * The records in browser storage, served from memory. Appended records are also
 * marked unwritten, in the same transaction, while `holdForFolder` says so.
 */
export async function openLocalCopy(
  database: IDBDatabase,
  holdForFolder: () => boolean = () => false,
): Promise<ChangeLog> {
  const stored = await readAllPayloads(database, RECORDS);

  const inMemory = createInMemoryChangeLog();
  inMemory.append(stored.map((payload) => JSON.parse(payload)));

  const saveState = createSaveStateStore();
  let writesUnderway = 0;

  function put(records: readonly ChangeRecord[], hold: boolean) {
    const transaction = database.transaction([RECORDS, UNWRITTEN], "readwrite");
    for (const record of records) {
      const payload = toPayload(record);
      transaction.objectStore(RECORDS).put(payload, record.id);
      if (hold) transaction.objectStore(UNWRITTEN).put(payload, record.id);
    }
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
      console.error("budjet could not save a change", transaction.error);
      saveState.set({ status: "unsaved", reason: "write-failed" });
    };
  }

  return {
    append(records) {
      put(records, holdForFolder());
      inMemory.append(records);
    },
    merge(arriving) {
      const added = recordsToMerge(inMemory.readAll(), arriving);
      if (added.length === 0) return;
      put(added, false);
      inMemory.append(added);
    },
    readAll: inMemory.readAll,
    subscribe: inMemory.subscribe,
    saveState: saveState.get,
    subscribeToSaveState: saveState.subscribe,
  };
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

export async function rememberedFolderHandle(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  const database = await openDatabase(globalThis.indexedDB);
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
    const request = indexedDB.open(DATABASE, 3);
    request.onupgradeneeded = ({ oldVersion }) => {
      // Each step builds on what earlier versions made, so saved records stay.
      if (oldVersion < 1) {
        // Keyed by record id, which is not part of the payload's contents.
        request.result.createObjectStore(RECORDS);
      }
      if (oldVersion < 2) request.result.createObjectStore(DEVICE);
      if (oldVersion < 3) request.result.createObjectStore(UNWRITTEN);
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
