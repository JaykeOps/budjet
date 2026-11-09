/**
 * The Change Log: the append-only store of change records and the only home of
 * domain state (docs/adr/0004, docs/adr/0005).
 */

/** A hybrid logical clock reading: wall-clock milliseconds, then a counter for ties. */
export type Timestamp = { wallTime: number; counter: number };

export type ChangeRecord<Type extends string = string, Payload = unknown> = {
  id: string;
  /** The id of the thing this record changes. */
  subjectId: string;
  deviceId: string;
  timestamp: Timestamp;
  /** When a record written at an earlier place in the log really was written. See `writeAt`. */
  writtenAt?: number;
  type: Type;
  payload: Payload;
};

/** Why a change isn't saved yet: the folder's access lapsed, the folder is gone, or the write failed some other way. */
export type UnsavedReason = "access-lapsed" | "folder-gone" | "write-failed";

/**
 * Whether every change has reached where this Change Log keeps them. The same
 * object comes back until the state changes.
 */
export type SaveState =
  | { status: "saved" }
  | { status: "saving" }
  | { status: "unsaved"; reason: UnsavedReason };

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

/** Orders records oldest first: by timestamp, then device id, so every device agrees. */
export function compareRecords(a: ChangeRecord, b: ChangeRecord): number {
  return (
    a.timestamp.wallTime - b.timestamp.wallTime ||
    a.timestamp.counter - b.timestamp.counter ||
    compareStrings(a.deviceId, b.deviceId) ||
    compareStrings(a.id, b.id)
  );
}

/**
 * The most recent record for each thing, keyed by its id: when two records
 * change the same thing, the later one wins. Expects records oldest first, as
 * `readAll` returns them.
 */
export function latestBySubject<Record extends ChangeRecord>(
  records: readonly Record[],
): Map<string, Record> {
  const latest = new Map<string, Record>();
  for (const record of records) latest.set(record.subjectId, record);
  return latest;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

export type ChangeLogWriter = {
  readonly changeLog: ChangeLog;
  write<Type extends string, Payload>(
    subjectId: string,
    type: Type,
    payload: Payload,
  ): ChangeRecord<Type, Payload>;
  /**
   * Writes a new record at the place an earlier one holds in the Change Log, by
   * taking its timestamp. For Undo, when what a record means depends on what came
   * before it and it has to come back to where it was: a Replay of the log
   * then meets it there, on every device.
   */
  writeAt<Type extends string, Payload>(
    timestamp: Timestamp,
    subjectId: string,
    type: Type,
    payload: Payload,
  ): ChangeRecord<Type, Payload>;
};

/** Appends records made on this device to the Change Log. */
export function createChangeLogWriter(
  changeLog: ChangeLog,
  deviceId: string,
  { now = Date.now }: { now?: () => number } = {},
): ChangeLogWriter {
  return {
    changeLog,
    write(subjectId, type, payload) {
      const record = {
        id: crypto.randomUUID(),
        subjectId,
        deviceId,
        timestamp: nextTimestamp(changeLog.readAll().at(-1)?.timestamp, now()),
        type,
        payload,
      };
      changeLog.append([record]);
      return record;
    },
    writeAt(timestamp, subjectId, type, payload) {
      const record = {
        id: crypto.randomUUID(),
        subjectId,
        deviceId,
        timestamp,
        writtenAt: now(),
        type,
        payload,
      };
      changeLog.append([record]);
      return record;
    },
  };
}

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
