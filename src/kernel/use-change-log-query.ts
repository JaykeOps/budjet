import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ChangeLog, ChangeLogWriter, ChangeRecord } from "./change-log";

const ChangeLogWriterContext = createContext<ChangeLogWriter | null>(null);

/** Gives the components below it this device's ChangeLogWriter, which they read and write the Change Log through. */
export const ChangeLogWriterProvider = ChangeLogWriterContext.Provider;

export function useChangeLogWriter(): ChangeLogWriter {
  const writer = useContext(ChangeLogWriterContext);
  if (!writer)
    throw new Error(
      "useChangeLogWriter needs a ChangeLogWriterProvider above it",
    );
  return writer;
}

type Query<Result> = (records: readonly ChangeRecord[]) => Result;

/**
 * Runs a public query over the Change Log, recalculating only when the log
 * changes and re-rendering only when the result does. Pass a stable function
 * (a module-level query), not an inline one.
 */
export function useChangeLogQuery<Result>(query: Query<Result>): Result {
  const { changeLog } = useChangeLogWriter();
  const getSnapshot = useMemo(
    () => cachedQuery(changeLog, query),
    [changeLog, query],
  );
  return useSyncExternalStore(changeLog.subscribe, getSnapshot);
}

/**
 * Keeps the previous result while it still has the same value, so
 * useSyncExternalStore sees an unchanged snapshot and skips the re-render.
 */
function cachedQuery<Result>(
  changeLog: ChangeLog,
  query: Query<Result>,
): () => Result {
  let records: readonly ChangeRecord[] | undefined;
  let result = undefined as Result;
  return () => {
    const latest = changeLog.readAll();
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
