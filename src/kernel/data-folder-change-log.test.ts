import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { ChangeLog, ChangeRecord, SaveState } from "./change-log";
import { openDataFolderChangeLog } from "./data-folder-change-log";
import { createInMemoryFolder, type InMemoryFolder } from "./in-memory-folder";

/** One browser: storage shared by its tabs, and the folder it was given. */
function aBrowser(folder: InMemoryFolder = createInMemoryFolder()) {
  const indexedDB = new IDBFactory();
  return {
    folder,
    openTab: () =>
      openDataFolderChangeLog({
        indexedDB,
        folder,
        oneTabAtATime: folder.oneTabAtATime,
      }),
    openTabWithoutItsFolder: () =>
      openDataFolderChangeLog({
        indexedDB,
        oneTabAtATime: folder.oneTabAtATime,
      }),
  };
}

function saveStates(changeLog: ChangeLog): SaveState[] {
  const seen = [changeLog.saveState()];
  changeLog.subscribeToSaveState(() => seen.push(changeLog.saveState()));
  return seen;
}

function settled(changeLog: ChangeLog): Promise<SaveState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = changeLog.saveState();
      if (state.status !== "saving") resolve(state);
    };
    changeLog.subscribeToSaveState(check);
    check();
  });
}

const OCT_31 = Date.UTC(2026, 9, 31, 23, 59);
const NOV_1 = Date.UTC(2026, 10, 1);
const DAY = 24 * 60 * 60 * 1000;

function record(id: string, wallTime = OCT_31, deviceId = "phone") {
  return {
    id,
    subjectId: "thing",
    deviceId,
    timestamp: { wallTime, counter: 0 },
    type: "Named",
    payload: { name: id },
  } satisfies ChangeRecord;
}

function lines(text: string | undefined): ChangeRecord[] {
  return (text ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("writing to the Data Folder", () => {
  it("writes one JSON record per line", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    const first = record("a");
    const second = record("b", OCT_31 + 1);

    changeLog.append([first]);
    changeLog.append([second]);
    await settled(changeLog);

    expect(folder.files.get("phone-2026-10.jsonl")).toBe(
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    );
  });

  it("keeps one file per device per Month, by the record's own wall time", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();

    changeLog.append([record("a", OCT_31), record("b", NOV_1)]);
    changeLog.append([record("c", NOV_1 + 1, "laptop")]);
    await settled(changeLog);

    expect([...folder.files.keys()].sort()).toEqual([
      "laptop-2026-11.jsonl",
      "phone-2026-10.jsonl",
      "phone-2026-11.jsonl",
    ]);
    expect(lines(folder.files.get("phone-2026-11.jsonl"))).toEqual([
      record("b", NOV_1),
    ]);
  });

  it("writes a burst of changes together", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();

    for (let i = 0; i < 20; i++)
      changeLog.append([record(`r${i}`, OCT_31 + i)]);
    await settled(changeLog);

    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toHaveLength(20);
    expect(folder.appends()).toBe(1);
  });

  it("keeps every record when changes keep coming during a write", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();

    for (let i = 0; i < 12; i++) {
      changeLog.append([record(`r${i}`, OCT_31 + i)]);
      await new Promise((resolve) => setTimeout(resolve));
    }
    await settled(changeLog);

    expect(
      lines(folder.files.get("phone-2026-10.jsonl")).map(({ id }) => id),
    ).toEqual(Array.from({ length: 12 }, (_, i) => `r${i}`));
  });

  it("keeps every record when two tabs write at once", async () => {
    const { folder, openTab } = aBrowser();
    const [one, other] = [await openTab(), await openTab()];

    for (let i = 0; i < 12; i++) {
      (i % 2 ? one : other).append([record(`r${i}`, OCT_31 + i)]);
      await new Promise((resolve) => setTimeout(resolve));
    }
    await Promise.all([settled(one), settled(other)]);

    const written = lines(folder.files.get("phone-2026-10.jsonl"));
    expect(written.map(({ id }) => id).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `r${i}`).sort(),
    );
  });

  it("counts a change as saved only once its write has finished", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    await settled(changeLog);
    const states = saveStates(changeLog);

    changeLog.append([record("a")]);
    expect(changeLog.saveState()).toEqual({ status: "saving" });
    expect(folder.files.size).toBe(0);

    await settled(changeLog);
    expect(folder.files.size).toBe(1);
    expect(states.at(-1)).toEqual({ status: "saved" });
    expect(states.filter(({ status }) => status === "saved")).toHaveLength(2);
  });

  it.each([
    ["NotAllowedError", "access-lapsed"],
    ["NotFoundError", "folder-gone"],
  ])("says why a change isn't saved after %s", async (errorName, reason) => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    folder.failWith(errorName);

    changeLog.append([record("a")]);

    expect(await settled(changeLog)).toEqual({ status: "unsaved", reason });
    expect(changeLog.readAll()).toEqual([record("a")]);
  });

  it("stays unsaved through a later failed write, then saves everything held", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    folder.failWith("NotFoundError");
    changeLog.append([record("a")]);
    await settled(changeLog);

    const states = saveStates(changeLog);
    changeLog.append([record("b", OCT_31 + 1)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(states.map(({ status }) => status)).not.toContain("saved");

    folder.failWith(undefined);
    changeLog.append([record("c", OCT_31 + 2)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await settled(changeLog);

    expect(changeLog.saveState()).toEqual({ status: "saved" });
    expect(
      lines(folder.files.get("phone-2026-10.jsonl")).map(({ id }) => id),
    ).toEqual(["a", "b", "c"]);
  });

  it("keeps trying records left unwritten when it's opened again", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    folder.failWith("NotAllowedError");
    changeLog.append([record("a")]);
    await settled(changeLog);
    expect(folder.files.size).toBe(0);

    folder.failWith(undefined);
    const reopened = await openTab();
    await settled(reopened);

    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toEqual([
      record("a"),
    ]);
  });

  it("waits for the folder on return, then writes what was held", async () => {
    const { folder, openTab, openTabWithoutItsFolder } = aBrowser();
    folder.failWith("NotAllowedError");
    const changeLog = await openTab();
    changeLog.append([record("a")]);
    expect(await settled(changeLog)).toEqual({
      status: "unsaved",
      reason: "access-lapsed",
    });
    folder.failWith(undefined);

    const returned = await openTabWithoutItsFolder();
    expect(await settled(returned)).toEqual({ status: "saved" });
    expect(folder.appends()).toBe(0);

    returned.returnToFolder(folder);
    await settled(returned);
    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toEqual([
      record("a"),
    ]);
  });

  it("writes a record once, not again on every later open", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    changeLog.append([record("a")]);
    await settled(changeLog);

    await settled(await openTab());

    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toHaveLength(1);
  });

  it("doesn't write merged records back to the folder", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();

    changeLog.merge([record("from-laptop", OCT_31, "laptop")]);
    await settled(changeLog);

    expect(changeLog.readAll()).toHaveLength(1);
    expect(folder.files.size).toBe(0);
  });
});

describe("a Budget not in a folder yet", () => {
  it("stays in browser storage until it's kept in a folder", async () => {
    const indexedDB = new IDBFactory();
    const folder = createInMemoryFolder();
    const open = () =>
      openDataFolderChangeLog({
        indexedDB,
        oneTabAtATime: folder.oneTabAtATime,
      });
    const changeLog = await open();

    changeLog.append([record("before")]);
    await settled(changeLog);
    expect(changeLog.saveState()).toEqual({ status: "saved" });

    changeLog.keepInFolder(folder);
    changeLog.append([record("after", OCT_31 + 1)]);
    await settled(changeLog);

    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toEqual([
      record("after", OCT_31 + 1),
    ]);
    expect((await open()).readAll()).toHaveLength(2);
  });
});

function deliver(
  folder: InMemoryFolder,
  fileName: string,
  records: readonly ChangeRecord[],
  lastModified?: number,
) {
  folder.deliver(
    fileName,
    records.map((r) => `${JSON.stringify(r)}\n`).join(""),
    lastModified,
  );
}

function ids(changeLog: ChangeLog): string[] {
  return changeLog.readAll().map(({ id }) => id);
}

describe("checking the Data Folder for other devices' changes", () => {
  it("merges another device's file on a full check, silently", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    const states = saveStates(changeLog);
    deliver(folder, "laptop-2026-10.jsonl", [record("from-laptop")]);

    await changeLog.checkFolder("full");

    expect(ids(changeLog)).toEqual(["from-laptop"]);
    expect(states.map(({ status }) => status)).not.toContain("unsaved");
    expect((await openTab()).readAll()).toHaveLength(1);
    expect(folder.appends()).toBe(0);
  });

  it("reads every file name and ignores repeated record ids", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    changeLog.append([record("mine")]);
    await settled(changeLog);
    deliver(folder, "combined by hand.txt", [
      record("old"),
      record("mine"),
      record("old"),
    ]);
    deliver(folder, "no-extension", [record("other"), record("old")]);

    await changeLog.checkFolder("full");

    expect(ids(changeLog).sort()).toEqual(["mine", "old", "other"]);
    expect((await openTab()).readAll()).toHaveLength(3);
  });

  it("skips a NotReadableError file, reads the rest, and retries it on the next check", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    deliver(folder, "busy.jsonl", [record("busy")]);
    deliver(folder, "fine.jsonl", [record("fine")]);
    folder.failReading("busy.jsonl", "NotReadableError");
    const states = saveStates(changeLog);

    await changeLog.checkFolder("full");
    expect(ids(changeLog)).toEqual(["fine"]);
    expect(states.map(({ status }) => status)).not.toContain("unsaved");

    folder.failReading("busy.jsonl", undefined);
    await changeLog.checkFolder("quick");
    expect(ids(changeLog).sort()).toEqual(["busy", "fine"]);
  });

  it("skips an unparseable line, keeps the file's other lines, and retries the file", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    const whole = JSON.stringify(record("whole"));
    const cutOff = JSON.stringify(record("cut-off"));
    folder.deliver(
      "syncing.jsonl",
      `${whole}\n{"not":"a record"}\n42\n${cutOff.slice(0, 20)}`,
    );

    await changeLog.checkFolder("full");
    expect(ids(changeLog)).toEqual(["whole"]);

    folder.deliver("syncing.jsonl", `${whole}\n${cutOff}\n`);
    await changeLog.checkFolder("quick");
    expect(ids(changeLog).sort()).toEqual(["cut-off", "whole"]);
  });

  it("leaves the save state alone when the folder can't be listed", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    await settled(changeLog);
    folder.failWith("NotFoundError");
    deliver(folder, "laptop.jsonl", [record("from-laptop")]);

    await changeLog.checkFolder("full");

    expect(changeLog.saveState()).toEqual({ status: "saved" });
    expect(changeLog.readAll()).toEqual([]);
  });

  it("reads a file again only once its date or size changes", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    deliver(folder, "laptop.jsonl", [record("a")]);
    await changeLog.checkFolder("full");
    folder.clearReads();

    await changeLog.checkFolder("quick");
    await changeLog.checkFolder("full");
    expect(folder.reads()).toEqual([]);

    deliver(folder, "laptop.jsonl", [record("a"), record("b")]);
    await changeLog.checkFolder("quick");
    expect(folder.reads()).toEqual(["laptop.jsonl"]);
    expect(ids(changeLog).sort()).toEqual(["a", "b"]);
  });

  it("doesn't read unchanged files again on the next open", async () => {
    const { folder, openTab } = aBrowser();
    deliver(folder, "laptop.jsonl", [record("a")]);
    await (await openTab()).checkFolder("full");
    folder.clearReads();

    const reopened = await openTab();
    await reopened.checkFolder("full");

    expect(folder.reads()).toEqual([]);
    expect(ids(reopened)).toEqual(["a"]);
  });

  it("merges an old file arriving late under a new name on a quick check", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    await changeLog.checkFolder("full");

    deliver(
      folder,
      "tablet-2021-03.jsonl",
      [record("late")],
      Date.now() - 2000 * DAY,
    );
    await changeLog.checkFolder("quick");

    expect(ids(changeLog)).toEqual(["late"]);
  });

  it("leaves a quiet file to the full check, which catches it growing late", async () => {
    const { folder, openTab } = aBrowser();
    const long = Date.now() - 400 * DAY;
    deliver(folder, "tablet-2025-01.jsonl", [record("a")], long);
    const changeLog = await openTab();
    await changeLog.checkFolder("full");
    folder.clearReads();

    deliver(
      folder,
      "tablet-2025-01.jsonl",
      [record("a"), record("late")],
      long,
    );
    await changeLog.checkFolder("quick");
    expect(folder.reads()).toEqual([]);
    expect(ids(changeLog)).toEqual(["a"]);
    expect(folder.stamps()).toEqual([]);

    await changeLog.checkFolder("full");
    expect(ids(changeLog).sort()).toEqual(["a", "late"]);
  });

  it("retries a quiet file on the next quick check after it can't be read", async () => {
    const { folder, openTab } = aBrowser();
    const long = Date.now() - 400 * DAY;
    deliver(folder, "tablet-2025-01.jsonl", [record("a")], long);
    const changeLog = await openTab();
    await changeLog.checkFolder("full");

    deliver(folder, "tablet-2025-01.jsonl", [record("a"), record("b")], long);
    folder.failReading("tablet-2025-01.jsonl", "NotReadableError");
    await changeLog.checkFolder("full");
    folder.failReading("tablet-2025-01.jsonl", undefined);
    await changeLog.checkFolder("quick");

    expect(ids(changeLog).sort()).toEqual(["a", "b"]);
  });

  it("stops between files when asked, keeps what it read, and finishes later", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    deliver(folder, "one.jsonl", [record("one")]);
    deliver(folder, "two.jsonl", [record("two")]);
    let filesAllowed = 1;

    const finished = await changeLog.checkFolder(
      "full",
      () => filesAllowed-- > 0,
    );
    expect(finished).toBe(false);
    expect(ids(changeLog)).toEqual(["one"]);
    folder.clearReads();

    expect(await changeLog.checkFolder("full")).toBe(true);
    expect(folder.reads()).toEqual(["two.jsonl"]);
    expect(ids(changeLog).sort()).toEqual(["one", "two"]);
  });

  it("doesn't read unchanged files again on returning to the folder", async () => {
    const { folder, openTab, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "laptop.jsonl", [record("a")]);
    await (await openTab()).checkFolder("full");
    folder.clearReads();

    const returned = await openTabWithoutItsFolder();
    returned.returnToFolder(folder);
    await settled(returned);
    await returned.checkFolder("full");

    expect(folder.reads()).toEqual([]);
    expect(ids(returned)).toEqual(["a"]);
  });

  it("reads everything again from a newly chosen folder", async () => {
    const { folder, openTab } = aBrowser();
    deliver(folder, "same.jsonl", [record("a")], 1000);
    const changeLog = await openTab();
    await changeLog.checkFolder("full");

    const chosen = createInMemoryFolder();
    deliver(chosen, "same.jsonl", [record("b")], 1000);
    changeLog.keepInFolder(chosen);
    await settled(changeLog);
    await changeLog.checkFolder("full");

    expect(ids(changeLog).sort()).toEqual(["a", "b"]);
  });

  it("does nothing for a Budget not in a folder", async () => {
    const changeLog = await openDataFolderChangeLog({
      indexedDB: new IDBFactory(),
    });

    await changeLog.checkFolder("full");

    expect(changeLog.readAll()).toEqual([]);
  });
});
