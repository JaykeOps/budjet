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
} from "./change-log";

const DATABASE = "budjet";
const RECORDS = "records";
const DEVICE = "device";
const DEVICE_ID = "id";

export async function openIndexedDbChangeLog({
  indexedDB = globalThis.indexedDB,
}: {
  indexedDB?: IDBFactory;
} = {}): Promise<ChangeLog> {
  const database = await openDatabase(indexedDB);
  const stored = await readAllPayloads(database);

  const inMemory = createInMemoryChangeLog();
  inMemory.append(stored.map((payload) => JSON.parse(payload)));

  return {
    append(records) {
      const transaction = database.transaction(RECORDS, "readwrite");
      const store = transaction.objectStore(RECORDS);
      for (const record of records) store.put(toPayload(record), record.id);
      transaction.onerror = () =>
        console.error("budjet could not save a change", transaction.error);
      inMemory.append(records);
    },
    readAll: inMemory.readAll,
    subscribe: inMemory.subscribe,
  };
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

function toPayload(record: ChangeRecord): string {
  return JSON.stringify(record);
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      // Each step builds on what earlier versions made, so saved records stay.
      if (oldVersion < 1) {
        // Keyed by record id, which is not part of the payload's contents.
        request.result.createObjectStore(RECORDS);
      }
      if (oldVersion < 2) request.result.createObjectStore(DEVICE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllPayloads(database: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(RECORDS).objectStore(RECORDS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
