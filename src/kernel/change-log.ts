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
  type: Type;
  payload: Payload;
};

export type ChangeLog = {
  append(records: readonly ChangeRecord[]): void;
  /** Every record, oldest first. The same array comes back until the next append. */
  readAll(): readonly ChangeRecord[];
  subscribe(listener: () => void): () => void;
};

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

export function createInMemoryChangeLog(): ChangeLog {
  let records: readonly ChangeRecord[] = [];
  const listeners = new Set<() => void>();
  return {
    append(added) {
      records = [...records, ...added].sort(compareRecords);
      for (const listener of listeners) listener();
    },
    readAll: () => records,
    subscribe(listener) {
      // Wrapped so the same function can subscribe twice and unsubscribe once.
      const entry = () => listener();
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
  };
}

export type Writer = {
  readonly changeLog: ChangeLog;
  write<Type extends string, Payload>(
    subjectId: string,
    type: Type,
    payload: Payload,
  ): ChangeRecord<Type, Payload>;
};

/** Appends records made on this device to the Change Log. */
export function createWriter(
  changeLog: ChangeLog,
  deviceId: string,
  { now = Date.now }: { now?: () => number } = {},
): Writer {
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
