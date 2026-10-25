import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  type ChangeRecord,
  createInMemoryChangeLog,
} from "./change-log";
import {
  openIndexedDbChangeLog,
  openIndexedDbDeviceId,
} from "./indexed-db-change-log";

/**
 * Each adapter gives every test fresh storage, which `open` opens. Opening it
 * again shows what a later visit to budjet would read back.
 */
type Adapter = { name: string; storage(): { open(): Promise<ChangeLog> } };

const adapters: Adapter[] = [
  {
    name: "in memory",
    storage() {
      const changeLog = createInMemoryChangeLog();
      return { open: async () => changeLog };
    },
  },
  {
    name: "IndexedDB",
    storage() {
      const indexedDB = new IDBFactory();
      return { open: () => openIndexedDbChangeLog({ indexedDB }) };
    },
  },
];

describe.each(adapters)("Change Log adapter: $name", ({ storage }) => {
  it("starts empty", async () => {
    const changeLog = await storage().open();
    expect(changeLog.readAll()).toEqual([]);
  });

  it("reads back every appended record, oldest first", async () => {
    const changeLog = await storage().open();
    changeLog.append([later]);
    changeLog.append([earlier, latest]);

    expect(changeLog.readAll()).toEqual([earlier, later, latest]);
  });

  it("notifies subscribers on append until they unsubscribe", async () => {
    const changeLog = await storage().open();
    let notifications = 0;
    const unsubscribe = changeLog.subscribe(() => {
      notifications++;
    });

    changeLog.append([earlier]);
    unsubscribe();
    changeLog.append([later]);

    expect(notifications).toBe(1);
  });

  it("gives records back unchanged when opened again", async () => {
    const store = storage();
    const changeLog = await store.open();
    changeLog.append([later, earlier]);
    changeLog.append([latest]);

    const reopened = await store.open();

    expect(reopened.readAll()).toEqual([earlier, later, latest]);
  });
});

describe("IndexedDB Change Log", () => {
  it("keeps no indexes on record contents", async () => {
    const indexedDB = new IDBFactory();
    const changeLog = await openIndexedDbChangeLog({ indexedDB });
    changeLog.append([earlier]);

    const database = await openDatabase(indexedDB);
    const storeNames = [...database.objectStoreNames];
    const transaction = database.transaction(storeNames);
    for (const name of storeNames) {
      expect(transaction.objectStore(name).indexNames).toHaveLength(0);
    }
    database.close();
  });
});

describe("this device's id in IndexedDB", () => {
  it("is the same every time the same storage is opened", async () => {
    const indexedDB = new IDBFactory();
    const first = await openIndexedDbDeviceId({ indexedDB });

    const second = await openIndexedDbDeviceId({ indexedDB });

    expect(second).toBe(first);
  });

  it("is new for fresh storage", async () => {
    const one = await openIndexedDbDeviceId({ indexedDB: new IDBFactory() });
    const other = await openIndexedDbDeviceId({ indexedDB: new IDBFactory() });

    expect(other).not.toBe(one);
  });

  it("keeps records saved before the device id was stored", async () => {
    const indexedDB = new IDBFactory();
    await saveRecordsTheFirstWay(indexedDB, [later, earlier]);

    await openIndexedDbDeviceId({ indexedDB });
    const changeLog = await openIndexedDbChangeLog({ indexedDB });

    expect(changeLog.readAll()).toEqual([earlier, later]);
  });
});

/** Saves records as the first version of the database did: one store, keyed by record id. */
function saveRecordsTheFirstWay(
  indexedDB: IDBFactory,
  records: ChangeRecord[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("budjet", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("records");
      for (const record of records)
        store.put(JSON.stringify(record), record.id);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("budjet");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function record(id: string, wallTime: number, payload: unknown): ChangeRecord {
  return {
    id,
    subjectId: "thing",
    deviceId: "phone",
    timestamp: { wallTime, counter: 0 },
    type: "Named",
    payload,
  };
}

const earlier = record("a", 1_000, { version: 1, name: "Rent" });
const later = record("b", 2_000, {
  version: 1,
  name: "Groceries & dining — 50 %",
  amount: { minorUnits: -12_345, currency: "SEK" },
  tags: ["food", null, true],
});
const latest = record("c", 3_000, { version: 1, name: "Housing" });
