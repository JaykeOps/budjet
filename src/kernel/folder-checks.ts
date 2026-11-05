/**
 * Reading other devices' changes out of a Data Folder (docs/adr/0009), at a cost
 * a phone can afford. Listing is cheap, checking a file's date and size less so,
 * and reading it is dearest, so a file is read only when its date or size has
 * changed. A file with no stamp is one never read in full, whether it's a new
 * name or one that failed, so every check tries it.
 */
import type { ChangeRecord } from "./change-log";
import type { Folder } from "./data-folder-change-log";

/** `quick` checks new names and recently active files. `full` covers every file. */
export type CheckScope = "quick" | "full";

export type FileStamp = { size: number; lastModified: number };
export type FileStamps = Record<string, FileStamp>;

/**
 * A file still being added to belongs to its device's current Month, so it last
 * changed within this long ago. A next Month's file is a new name.
 */
const RECENTLY_ACTIVE = 31 * 24 * 60 * 60 * 1000;

/**
 * What the folder holds that the stamps say hasn't been read. A failure is
 * silent: a file that can't be read has lost its stamp, so it's retried, and a
 * folder that can't be listed is tried again on the next check.
 */
export async function readChanges(
  folder: Folder,
  scope: CheckScope,
  stamps: FileStamps,
  keepGoing: () => boolean,
): Promise<{
  records: ChangeRecord[];
  stamps: FileStamps;
  finished: boolean;
}> {
  const records: ChangeRecord[] = [];
  let found = stamps;
  const setStamp = (name: string, stamp: FileStamp | undefined) => {
    if (!stamp && !found[name]) return;
    const { [name]: _, ...others } = found;
    found = stamp ? { ...others, [name]: stamp } : others;
  };

  let names: string[];
  try {
    names = await folder.list();
  } catch {
    return { records, stamps, finished: false };
  }

  for (const name of names) {
    if (!keepGoing()) return { records, stamps: found, finished: false };
    const known = stamps[name];
    if (scope === "quick" && known && !recentlyActive(known)) continue;
    try {
      // Stamped before reading: a change in between only means another read.
      const stamp = await folder.stamp(name);
      if (known && sameStamp(known, stamp)) continue;
      const file = parseRecords(await folder.read(name));
      for (const record of file.records) records.push(record);
      setStamp(name, file.whole ? stamp : undefined);
    } catch {
      setStamp(name, undefined);
    }
  }
  return { records, stamps: found, finished: true };
}

function recentlyActive({ lastModified }: FileStamp) {
  return Date.now() - lastModified < RECENTLY_ACTIVE;
}

export function sameStamp(a: FileStamp, b: FileStamp) {
  return a.size === b.size && a.lastModified === b.lastModified;
}

/** A line that isn't a whole record is left out, and `whole` says so. */
export function parseRecords(text: string) {
  const records: ChangeRecord[] = [];
  let whole = true;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const record = parseRecord(line);
    if (record) records.push(record);
    else whole = false;
  }
  return { records, whole };
}

function parseRecord(line: string): ChangeRecord | undefined {
  try {
    const parsed = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Checked because a cut-off line can still be valid JSON, and folds trust every record. */
function isRecord(value: Partial<ChangeRecord> | null): value is ChangeRecord {
  return (
    typeof value?.id === "string" &&
    typeof value.subjectId === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.type === "string" &&
    typeof value.timestamp?.wallTime === "number" &&
    typeof value.timestamp.counter === "number"
  );
}

export type Page = {
  isVisible(): boolean;
  onRegainedFocus(listener: () => void): void;
};

const QUICK_CHECK_EVERY = 5 * 60 * 1000;
const FOCUS_CHECK_AT_MOST_EVERY = 30 * 1000;

/**
 * Keeps checking for as long as the page lives: a full check once per open and
 * quick checks after it, one at a time and never while the page is hidden. A
 * full check that didn't get through the folder is taken up again by the next
 * turn, and what it had read is already stamped.
 */
export function scheduleFolderChecks(
  checkFolder: (
    scope: CheckScope,
    keepGoing: () => boolean,
  ) => Promise<boolean>,
  page: Page = browserPage,
): void {
  let checking = false;
  let fullCheckDone = false;
  let lastCheck = Number.NEGATIVE_INFINITY;

  async function check() {
    if (checking || !page.isVisible()) return;
    checking = true;
    lastCheck = Date.now();
    try {
      if (fullCheckDone) await checkFolder("quick", page.isVisible);
      else fullCheckDone = await checkFolder("full", page.isVisible);
    } finally {
      checking = false;
    }
  }

  void check();
  setInterval(check, QUICK_CHECK_EVERY);
  page.onRegainedFocus(() => {
    if (Date.now() - lastCheck >= FOCUS_CHECK_AT_MOST_EVERY) void check();
  });
}

const browserPage: Page = {
  isVisible: () => document.visibilityState === "visible",
  onRegainedFocus(listener) {
    window.addEventListener("focus", listener);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") listener();
    });
  },
};
