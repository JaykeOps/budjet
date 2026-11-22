import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ChangeRecord, DeviceChangeLog, SaveState } from "./change-log";

const DeviceChangeLogContext = createContext<DeviceChangeLog | null>(null);

/** Gives the components below it this device's DeviceChangeLog, which they read and write the Change Log through. */
export const DeviceChangeLogProvider = DeviceChangeLogContext.Provider;

export function useDeviceChangeLog(): DeviceChangeLog {
  const log = useContext(DeviceChangeLogContext);
  if (!log)
    throw new Error(
      "useDeviceChangeLog needs a DeviceChangeLogProvider above it",
    );
  return log;
}

/** Whether every change has reached where the Change Log keeps them. */
export function useSaveState(): SaveState {
  const log = useDeviceChangeLog();
  return useSyncExternalStore(log.subscribeToSaveState, log.saveState);
}

type Query<Result> = (records: readonly ChangeRecord[]) => Result;

/**
 * Runs a public query over the Change Log, recalculating only when the log
 * changes and re-rendering only when the result does. Pass a stable function
 * (a module-level query), not an inline one.
 */
export function useChangeLogQuery<Result>(query: Query<Result>): Result {
  const log = useDeviceChangeLog();
  const getSnapshot = useMemo(() => cachedQuery(log, query), [log, query]);
  return useSyncExternalStore(log.subscribe, getSnapshot);
}

/**
 * Keeps the previous result while it still has the same value, so
 * useSyncExternalStore sees an unchanged snapshot and skips the re-render.
 */
function cachedQuery<Result>(
  log: Pick<DeviceChangeLog, "readAll">,
  query: Query<Result>,
): () => Result {
  let records: readonly ChangeRecord[] | undefined;
  let result = undefined as Result;
  return () => {
    const latest = log.readAll();
    if (latest !== records) {
      records = latest;
      const next = query(latest);
      if (!isEqual(next, result)) result = next;
    }
    return result;
  };
}

/**
 * Value equality for query results: plain objects and arrays are compared
 * field by field. Anything else (a Map, a Date) only equals itself, so a
 * changed one is never mistaken for the old one.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainData(a) || !isPlainData(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        isEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}

function isPlainData(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === Array.prototype;
}
