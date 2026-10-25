/**
 * The browser storage adapter for the Change Log. Storage is opaque: each
 * record is kept as its id plus an opaque payload, with no indexes on its
 * contents, so a later adapter can encrypt records without any slice changing.
 * Every record is read once on opening and then served from memory.
 */
import {
  type ChangeLog,
  type ChangeRecord,
  createInMemoryChangeLog,
} from "./change-log";

const DATABASE = "budjet";
const RECORDS = "records";

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

function toPayload(record: ChangeRecord): string {
  return JSON.stringify(record);
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      // Keyed by record id, which is not part of the payload's contents.
      request.result.createObjectStore(RECORDS);
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
