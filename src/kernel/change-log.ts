/**
 * The Change Log: the append-only store of change records and the only home of
 * domain state (docs/adr/0004, docs/adr/0005).
 */
import { newId, type RecordId } from "./id";

export type ChangeRecord<
  Type extends string = string,
  Payload = unknown,
  Subject extends string = string,
> = {
  id: RecordId;
  /** The id of the thing this record changes. Each record type says what kind. */
  subjectId: Subject;
  deviceId: string;
  timestamp: Timestamp;
  /** When a record written at an earlier place in the log really was written. See `writeAt`. */
  writtenAt?: number;
  type: Type;
  payload: Payload;
};

export type ChangeLog = {
  /** Records a change. It shows at once, and `saveState` follows its write. */
  append(records: readonly ChangeRecord[]): void;
  /** Adds records that arrived from elsewhere, ignoring ids it already has. */
  merge(records: readonly ChangeRecord[]): void;
  /** Every record, oldest first. The same array comes back until the next append. */
  readAll(): readonly ChangeRecord[];
  subscribe(listener: () => void): () => void;
  saveState(): SaveState;
  subscribeToSaveState(listener: () => void): () => void;
};

/**
 * This device's way into the Change Log: it reads it, and adds the Change
 * Records this device makes, stamped by this device's clock. It has no `append`
 * or `merge`, so a record can't be added any other way.
 *
 * A write is built in three steps, and nothing is written until the last:
 * `write(subjectId, type)` says what changes, `ensure(check)` reads the records
 * as they stand and refuses the write by throwing, and `commit` builds the
 * payload from what the check found. So no record is written without a check,
 * and the check never holds the Change Log itself.
 */
export type DeviceChangeLog = Pick<
  ChangeLog,
  "readAll" | "subscribe" | "saveState" | "subscribeToSaveState"
> & {
  write<Type extends string, Payload, Subject extends string = string>(
    subjectId: Subject,
    type: Type,
  ): Write<Type, Payload, Subject>;
  /**
   * Writes a new record at the place an earlier one holds in the Change Log, by
   * taking its timestamp. For Undo, when what a record means depends on what came
   * before it and it has to come back to where it was: a Replay of the log
   * then meets it there, on every device.
   */
  writeAt<Type extends string, Payload, Subject extends string = string>(
    timestamp: Timestamp,
    subjectId: Subject,
    type: Type,
  ): Write<Type, Payload, Subject>;
  /**
   * Writes any number of records from one check, each stamped after the last,
   * all together or none. For a change that is several records, such as a
   * reorder, or that writes a record only when something differs.
   */
  writeMany<Record extends ChangeRecord = ChangeRecord>(): WriteMany<Record>;
};

/**
 * Reads the records as they stand and returns what a write is built from. It
 * refuses the write by throwing, with the reason.
 */
export type Check<Found> = (records: readonly ChangeRecord[]) => Found;

/**
 * A record still to be written: what it changes and how. Over a union of
 * record types it is one of them, so a type is never paired with another's
 * payload.
 */
export type NewChangeRecord<Record extends ChangeRecord = ChangeRecord> =
  Record extends ChangeRecord
    ? Pick<Record, "subjectId" | "type" | "payload">
    : never;

export type Write<Type extends string, Payload, Subject extends string> = {
  ensure<Found>(check: Check<Found>): {
    commit(
      payload: (found: Found) => Payload,
    ): ChangeRecord<Type, Payload, Subject>;
  };
};

export type WriteMany<Record extends ChangeRecord> = {
  ensure<Found>(check: Check<Found>): {
    commit(
      records: (found: Found) => readonly NewChangeRecord<Record>[],
    ): ChangeRecord<Record["type"], Record["payload"], Record["subjectId"]>[];
  };
};

/** This device's DeviceChangeLog over `changeLog`. */
export function createDeviceChangeLog(
  changeLog: ChangeLog,
  deviceId: string,
  { now = Date.now }: { now?: () => number } = {},
): DeviceChangeLog {
  return {
    readAll: changeLog.readAll,
    subscribe: changeLog.subscribe,
    saveState: changeLog.saveState,
    subscribeToSaveState: changeLog.subscribeToSaveState,
    write: (subjectId, type) => ({
      ensure: (check) => ({
        commit(payload) {
          const records = changeLog.readAll();
          const found = check(records);
          const record = {
            id: newId<RecordId>(),
            subjectId,
            deviceId,
            timestamp: nextTimestamp(records.at(-1)?.timestamp, now()),
            type,
            payload: payload(found),
          };
          changeLog.append([record]);
          return record;
        },
      }),
    }),
    writeAt: (timestamp, subjectId, type) => ({
      ensure: (check) => ({
        commit(payload) {
          const found = check(changeLog.readAll());
          const record = {
            id: newId<RecordId>(),
            subjectId,
            deviceId,
            timestamp,
            writtenAt: now(),
            type,
            payload: payload(found),
          };
          changeLog.append([record]);
          return record;
        },
      }),
    }),
    writeMany: () => ({
      ensure: (check) => ({
        commit(build) {
          const records = changeLog.readAll();
          const found = check(records);
          let last = records.at(-1)?.timestamp;
          const added = build(found).map(({ subjectId, type, payload }) => {
            last = nextTimestamp(last, now());
            return {
              id: newId<RecordId>(),
              subjectId,
              deviceId,
              timestamp: last,
              type,
              payload,
            };
          });
          if (added.length > 0) changeLog.append(added);
          return added;
        },
      }),
    }),
  };
}

/** A hybrid logical clock reading: wall-clock milliseconds, then a counter for ties. */
export type Timestamp = { wallTime: number; counter: number };

/**
 * The hybrid logical clock step: a new record is stamped after every record
 * this device has seen, even when another device's clock runs ahead of ours.
 */
function nextTimestamp(
  newestSeen: Timestamp | undefined,
  wallTime: number,
): Timestamp {
  if (!newestSeen || wallTime > newestSeen.wallTime) {
    return { wallTime, counter: 0 };
  }
  return { wallTime: newestSeen.wallTime, counter: newestSeen.counter + 1 };
}

/** Orders records oldest first: by timestamp, then device id, so every device agrees. */
export function compareRecords(a: ChangeRecord, b: ChangeRecord): number {
  return (
    a.timestamp.wallTime - b.timestamp.wallTime ||
    a.timestamp.counter - b.timestamp.counter ||
    compareStrings(a.deviceId, b.deviceId) ||
    compareStrings(a.id, b.id)
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** What `merge` should add: each id once, leaving out ids already held. */
export function recordsToMerge(
  held: readonly ChangeRecord[],
  arriving: readonly ChangeRecord[],
): ChangeRecord[] {
  const seen = new Set(held.map(({ id }) => id));
  return arriving.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * The most recent record for each thing, keyed by its id: when two records
 * change the same thing, the later one wins. Expects records oldest first, as
 * `readAll` returns them.
 */
export function latestBySubject<Record extends ChangeRecord>(
  records: readonly Record[],
): Map<Record["subjectId"], Record> {
  const latest = new Map<Record["subjectId"], Record>();
  for (const record of records) latest.set(record.subjectId, record);
  return latest;
}

/**
 * Every subject with a delete record. A deleted thing stays deleted whatever else
 * is written about it, before or after (docs/adr/0006), so Replays leave out these
 * subjects' other records.
 */
export function deletedSubjects<Deleted extends ChangeRecord>(
  records: readonly ChangeRecord[],
  isDelete: (record: ChangeRecord) => record is Deleted,
): Set<Deleted["subjectId"]>;
export function deletedSubjects(
  records: readonly ChangeRecord[],
  isDelete: (record: ChangeRecord) => boolean,
): Set<string>;
export function deletedSubjects(
  records: readonly ChangeRecord[],
  isDelete: (record: ChangeRecord) => boolean,
): Set<string> {
  const deleted = new Set<string>();
  for (const record of records) {
    if (isDelete(record)) deleted.add(record.subjectId);
  }
  return deleted;
}

/**
 * Wraps a Replay of every record so it runs once per Change Log snapshot:
 * `readAll` returns the same array until the next append, so every query
 * reading the same records shares one result.
 */
export function perSnapshot<Result>(
  replay: (records: readonly ChangeRecord[]) => Result,
): (records: readonly ChangeRecord[]) => Result {
  const results = new WeakMap<readonly ChangeRecord[], Result>();
  return (records) => {
    if (results.has(records)) return results.get(records) as Result;
    const result = replay(records);
    results.set(records, result);
    return result;
  };
}

/**
 * Whether every change has reached where this Change Log keeps them. The same
 * object comes back until the state changes.
 */
export type SaveState =
  | { status: "saved" }
  | { status: "saving" }
  | { status: "unsaved"; reason: UnsavedReason };

/** Why a change isn't saved yet: the folder's access lapsed, the folder is gone, or the write failed some other way. */
export type UnsavedReason = "access-lapsed" | "folder-gone" | "write-failed";

export const SAVED: SaveState = { status: "saved" };
export const SAVING: SaveState = { status: "saving" };

/** Holds a Change Log's save state and tells subscribers when it changes. */
export function createSaveStateStore() {
  let state = SAVED;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: SaveState) {
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      const entry = () => listener();
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
  };
}

export function createInMemoryChangeLog(): ChangeLog & {
  /** Swaps every record for these, as a change of Budget does. */
  replaceAll(records: readonly ChangeRecord[]): void;
} {
  let records: readonly ChangeRecord[] = [];
  const listeners = new Set<() => void>();
  const replaceAll = (next: readonly ChangeRecord[]) => {
    records = [...next].sort(compareRecords);
    for (const listener of listeners) listener();
  };
  const append = (added: readonly ChangeRecord[]) =>
    replaceAll([...records, ...added]);
  return {
    append,
    replaceAll,
    merge(arriving) {
      const added = recordsToMerge(records, arriving);
      if (added.length > 0) append(added);
    },
    readAll: () => records,
    subscribe(listener) {
      // Wrapped so the same function can subscribe twice and unsubscribe once.
      const entry = () => listener();
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    // Nothing to wait for: a change is as saved as it will ever be.
    saveState: () => SAVED,
    subscribeToSaveState: () => () => {},
  };
}
