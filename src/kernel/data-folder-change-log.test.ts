import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  type ChangeLog,
  type ChangeRecord,
  SAVED,
  type SaveState,
} from "./change-log";
import {
  type DataFolderChangeLog,
  openDataFolderChangeLog,
} from "./data-folder-change-log";
import { createInMemoryFolder, type InMemoryFolder } from "./in-memory-folder";
import { rememberedFolderHandle } from "./indexed-db-change-log";

/** One browser: storage shared by its tabs, and the folder it was given. */
function aBrowser(folder: InMemoryFolder = createInMemoryFolder()) {
  const indexedDB = new IDBFactory();
  const onTwoBudgets = vi.fn();
  const options = {
    indexedDB,
    oneTabAtATime: folder.oneTabAtATime,
    budgetIds,
    onTwoBudgets,
  };
  return {
    folder,
    onTwoBudgets,
    openTab: () => openDataFolderChangeLog({ ...options, folder }),
    openTabWithoutItsFolder: () => openDataFolderChangeLog(options),
  };
}

function budgetIds(records: readonly ChangeRecord[]) {
  return records
    .filter(({ type }) => type === "BudgetCreated")
    .map(({ subjectId }) => subjectId);
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

  it("files a record written at an earlier place by when it was written, where a quick check will find it", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    const placed = { ...record("a", OCT_31), writtenAt: NOV_1 };

    changeLog.append([placed]);
    await settled(changeLog);

    expect([...folder.files.keys()]).toEqual(["phone-2026-11.jsonl"]);
    expect(lines(folder.files.get("phone-2026-11.jsonl"))).toEqual([placed]);
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

    // Not `settled`: unsaved stays up until a write succeeds, so it can resolve before the retry runs.
    await vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({ status: "saved" }),
    );
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

  it.each([
    ["NotAllowedError", "access-lapsed"],
    ["NotFoundError", "folder-gone"],
  ])(
    "is still unsaved after a reopen following %s, holding the change",
    async (errorName, reason) => {
      const { folder, openTab } = aBrowser();
      const changeLog = await openTab();
      folder.failWith(errorName);
      changeLog.append([record("a")]);
      await settled(changeLog);

      const reopened = await openTab();

      expect(await settled(reopened)).toEqual({ status: "unsaved", reason });
      expect(reopened.readAll()).toEqual([record("a")]);
      expect(folder.files.size).toBe(0);
    },
  );

  it("says saved only after the held write finishes, staying unsaved until then", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    folder.failWith("NotFoundError");
    changeLog.append([record("a")]);
    await settled(changeLog);
    const filesWhenSaved: number[] = [];
    const states = saveStates(changeLog);
    changeLog.subscribeToSaveState(() => {
      if (changeLog.saveState().status === "saved") {
        filesWhenSaved.push(folder.files.size);
      }
    });

    folder.failWith(undefined);
    changeLog.keepInFolder(folder);
    expect(changeLog.saveState().status).toBe("unsaved");
    await vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({ status: "saved" }),
    );

    expect(states.map(({ status }) => status)).toEqual(["unsaved", "saved"]);
    expect(filesWhenSaved).toEqual([1]);
  });

  it("writes held changes to a folder given while a write to the lost one is failing", async () => {
    const { folder: lost, openTab } = aBrowser();
    const changeLog = await openTab();
    lost.failWith("NotFoundError");
    changeLog.append([record("a")]);
    await settled(changeLog);
    const found = createInMemoryFolder();

    changeLog.append([record("b", OCT_31 + 1)]);
    changeLog.keepInFolder(found);

    await vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({ status: "saved" }),
    );
    expect(
      lines(found.files.get("phone-2026-10.jsonl")).map(({ id }) => id),
    ).toEqual(["a", "b"]);
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
        budgetIds,
        onTwoBudgets() {},
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

describe("moving a Budget from browser storage into a folder", () => {
  const HANDLE = { name: "Budgets" } as FileSystemDirectoryHandle;

  /** A Budget in browser storage with records in two files once it's moved. */
  async function aBudgetInBrowserStorage() {
    const indexedDB = new IDBFactory();
    const chosen = createInMemoryFolder();
    const openTab = () =>
      openDataFolderChangeLog({
        indexedDB,
        oneTabAtATime: chosen.oneTabAtATime,
        budgetIds,
        onTwoBudgets: () => {},
      });
    const changeLog = await openTab();
    changeLog.append([record("a", OCT_31), record("b", NOV_1)]);
    await settled(changeLog);
    return { indexedDB, chosen, openTab, changeLog };
  }

  /** The Budget is where it was: same records, not in a folder, nothing waiting to be written. */
  async function expectNothingChanged({
    indexedDB,
    changeLog,
    chosen,
  }: Awaited<ReturnType<typeof aBudgetInBrowserStorage>>) {
    const appendsSoFar = chosen.appends();
    expect(changeLog.inFolder()).toBe(false);
    expect(changeLog.saveState()).toEqual({ status: "saved" });
    expect(changeLog.readAll().map(({ id }) => id)).toEqual(["a", "b"]);
    expect(await rememberedFolderHandle({ indexedDB })).toBeUndefined();

    changeLog.append([record("after", NOV_1 + 1)]);
    await settled(changeLog);
    expect(chosen.appends()).toBe(appendsSoFar);

    const elsewhere = createInMemoryFolder();
    const reopened = await openDataFolderChangeLog({
      indexedDB,
      folder: elsewhere,
      oneTabAtATime: elsewhere.oneTabAtATime,
      budgetIds,
      onTwoBudgets: () => {},
    });
    await settled(reopened);
    expect(elsewhere.files.size).toBe(0);
  }

  it("copies every record, then keeps later changes in the folder and remembers it", async () => {
    const { indexedDB, chosen, changeLog } = await aBudgetInBrowserStorage();

    expect(await changeLog.moveIntoFolder(chosen, HANDLE)).toBe("moved");
    changeLog.append([record("c", NOV_1 + 1)]);
    await settled(changeLog);

    expect(lines(chosen.files.get("phone-2026-10.jsonl"))).toEqual([
      record("a", OCT_31),
    ]);
    expect(lines(chosen.files.get("phone-2026-11.jsonl"))).toEqual([
      record("b", NOV_1),
      record("c", NOV_1 + 1),
    ]);
    expect(changeLog.inFolder()).toBe(true);
    expect(await rememberedFolderHandle({ indexedDB })).toEqual(HANDLE);
  });

  it("keeps the browser's records as the Local Copy", async () => {
    const { chosen, openTab, changeLog } = await aBudgetInBrowserStorage();

    await changeLog.moveIntoFolder(chosen, HANDLE);
    chosen.files.clear();

    expect((await openTab()).readAll().map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("copies records another tab added, which this one hasn't seen", async () => {
    const { chosen, openTab, changeLog } = await aBudgetInBrowserStorage();
    const other = await openTab();
    other.append([record("from-the-other-tab", OCT_31 + 1)]);
    await settled(other);

    await changeLog.moveIntoFolder(chosen, HANDLE);

    expect(
      lines(chosen.files.get("phone-2026-10.jsonl")).map(({ id }) => id),
    ).toContain("from-the-other-tab");
  });

  it("writes a change another tab made after the switch, before it reloaded", async () => {
    const { indexedDB, chosen, openTab, changeLog } =
      await aBudgetInBrowserStorage();
    const other = await openTab();

    await changeLog.moveIntoFolder(chosen, HANDLE);
    other.append([record("around-the-move", NOV_1 + 1)]);
    await settled(other);

    const reloaded = await openDataFolderChangeLog({
      indexedDB,
      oneTabAtATime: chosen.oneTabAtATime,
      budgetIds,
      onTwoBudgets: () => {},
    });
    reloaded.returnToFolder(chosen);
    await vi.waitFor(async () =>
      expect(await reloaded.hasUnsavedChanges()).toBe(false),
    );

    expect(
      lines(chosen.files.get("phone-2026-11.jsonl")).map(({ id }) => id),
    ).toContain("around-the-move");
  });

  it("writes a change made while the copy was running", async () => {
    const { chosen, changeLog } = await aBudgetInBrowserStorage();

    const moving = changeLog.moveIntoFolder(chosen, HANDLE);
    await new Promise((resolve) => setTimeout(resolve));
    changeLog.append([record("during", NOV_1 + 1)]);
    expect(await moving).toBe("moved");
    await settled(changeLog);

    expect(
      lines(chosen.files.get("phone-2026-11.jsonl")).map(({ id }) => id),
    ).toContain("during");
  });

  it("changes nothing when a write fails partway, and leaves no part of the Budget in the folder", async () => {
    const budget = await aBudgetInBrowserStorage();
    const { chosen, changeLog } = budget;
    const failing = {
      ...chosen,
      append: async (fileName: string, text: string) => {
        if (fileName.includes("2026-11")) {
          throw new DOMException("Disk full", "QuotaExceededError");
        }
        await chosen.append(fileName, text);
      },
    };

    expect(await changeLog.moveIntoFolder(failing, HANDLE)).toBe("failed");

    expect(chosen.files.size).toBe(0);
    await expectNothingChanged(budget);
  });

  it("changes nothing when reading back doesn't show every record", async () => {
    const budget = await aBudgetInBrowserStorage();
    const { chosen, changeLog } = budget;
    const losing = { ...chosen, read: async () => "" };

    expect(await changeLog.moveIntoFolder(losing, HANDLE)).toBe("failed");

    expect(chosen.files.size).toBe(0);
    await expectNothingChanged(budget);
  });

  it("changes nothing when the folder can't be listed", async () => {
    const budget = await aBudgetInBrowserStorage();
    const { chosen, changeLog } = budget;
    const refusing = {
      ...chosen,
      list: async () => {
        throw new DOMException("Lapsed", "NotAllowedError");
      },
    };

    expect(await changeLog.moveIntoFolder(refusing, HANDLE)).toBe("failed");

    await expectNothingChanged(budget);
  });

  it("can try again when a failed or interrupted move left part of this Budget behind", async () => {
    const { chosen, changeLog } = await aBudgetInBrowserStorage();
    chosen.files.set(
      "phone-2026-10.jsonl",
      `${JSON.stringify(record("a", OCT_31))}\n`,
    );

    expect(await changeLog.moveIntoFolder(chosen, HANDLE)).toBe("moved");

    expect(lines(chosen.files.get("phone-2026-11.jsonl"))).toEqual([
      record("b", NOV_1),
    ]);
  });

  it("refuses a folder that already holds a Budget, adding nothing to it", async () => {
    const budget = await aBudgetInBrowserStorage();
    const { chosen, changeLog } = budget;
    const theirs = `${JSON.stringify(record("theirs", OCT_31, "laptop"))}\n`;
    chosen.files.set("laptop-2026-10.jsonl", theirs);

    expect(await changeLog.moveIntoFolder(chosen, HANDLE)).toBe(
      "holds-a-budget",
    );

    expect([...chosen.files]).toEqual([["laptop-2026-10.jsonl", theirs]]);
    await expectNothingChanged(budget);
  });

  it("takes a folder whose subfolder holds no records", async () => {
    const { chosen, changeLog } = await aBudgetInBrowserStorage();
    chosen.files.set("empty.jsonl", "");

    expect(await changeLog.moveIntoFolder(chosen, HANDLE)).toBe("moved");
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

  it("takes a failure found outside a write as unsaved, until a write succeeds", async () => {
    const { openTab, folder } = aBrowser();
    const changeLog = await openTab();

    changeLog.folderFailed("folder-gone");
    expect(changeLog.saveState()).toEqual({
      status: "unsaved",
      reason: "folder-gone",
    });

    changeLog.returnToFolder(folder);
    await vi.waitFor(() => expect(changeLog.saveState()).toEqual(SAVED));
  });

  it("skips a file it can't write for NotReadableError, writes the rest, and retries it on the next check", async () => {
    const { folder, openTab } = aBrowser();
    const changeLog = await openTab();
    const states = saveStates(changeLog);
    folder.failAppending("phone-2026-10.jsonl", "NotReadableError");

    changeLog.append([record("busy", OCT_31), record("fine", NOV_1)]);
    await vi.waitFor(() =>
      expect(lines(folder.files.get("phone-2026-11.jsonl"))).toEqual([
        record("fine", NOV_1),
      ]),
    );
    expect(folder.files.has("phone-2026-10.jsonl")).toBe(false);
    expect(await changeLog.hasUnsavedChanges()).toBe(true);
    expect(states.map(({ status }) => status)).not.toContain("unsaved");

    folder.failAppending("phone-2026-10.jsonl", undefined);
    await changeLog.checkFolder("quick");
    await vi.waitFor(() => expect(changeLog.saveState()).toEqual(SAVED));

    expect(lines(folder.files.get("phone-2026-10.jsonl"))).toEqual([
      record("busy", OCT_31),
    ]);
    expect(await changeLog.hasUnsavedChanges()).toBe(false);
    expect(states.map(({ status }) => status)).not.toContain("unsaved");
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
      budgetIds,
      onTwoBudgets() {},
    });

    await changeLog.checkFolder("full");

    expect(changeLog.readAll()).toEqual([]);
  });
});

describe("reading a whole Budget from a folder", () => {
  const created = (id: string) => ({ ...record(id), type: "BudgetCreated" });

  it("fills the Local Copy from every file, counting as it goes", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "laptop.jsonl", [created("a")]);
    deliver(folder, "any name.txt", [record("b", OCT_31 + 1)]);
    const changeLog = await openTabWithoutItsFolder();
    const counts: string[] = [];

    const opened = await changeLog.readFolderInFull(folder, {
      onProgress: ({ read, of }) => counts.push(`${read} of ${of}`),
    });

    expect(opened).toBe("opened");
    expect(ids(changeLog)).toEqual(["a", "b"]);
    expect(counts).toEqual(["0 of 2", "1 of 2", "2 of 2"]);
    expect(ids(await openTabWithoutItsFolder())).toEqual(["a", "b"]);
  });

  it("doesn't read a folder with no files, and leaves the Local Copy as it was", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    const changeLog = await openTabWithoutItsFolder();
    const onProgress = vi.fn();

    const opened = await changeLog.readFolderInFull(folder, {
      onProgress,
    });

    expect(opened).toBe("no-budget");
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("shows nothing until the last file is in, even after leaving", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "first", [created("a")]);
    deliver(folder, "stuck", [record("b")]);
    folder.failReading("stuck", "NotReadableError");

    const changeLog = await openTabWithoutItsFolder();
    await leaveWhenStuck(changeLog, folder);

    expect(changeLog.readAll()).toEqual([]);
    expect((await openTabWithoutItsFolder()).readAll()).toEqual([]);
  });

  it("resumes after leaving, reading only the files it hasn't got", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "first", [created("a")]);
    deliver(folder, "second", [record("b", OCT_31 + 1)]);
    deliver(folder, "stuck", [record("c", OCT_31 + 2)]);
    folder.failReading("stuck", "NotReadableError");
    await leaveWhenStuck(await openTabWithoutItsFolder(), folder);

    folder.failReading("stuck", undefined);
    folder.clearReads();
    const counts: string[] = [];
    const back = await openTabWithoutItsFolder();
    expect(await back.fullReadUnderway()).toBe(true);
    await back.readFolderInFull(folder, {
      onProgress: ({ read, of }) => counts.push(`${read} of ${of}`),
    });

    expect(folder.reads()).toEqual(["stuck"]);
    expect(counts).toEqual(["2 of 3", "3 of 3"]);
    expect(ids(back)).toEqual(["a", "b", "c"]);
    expect(await back.fullReadUnderway()).toBe(false);
    expect(ids(await openTabWithoutItsFolder())).toEqual(["a", "b", "c"]);
  });

  it("on resuming, reads a file again if it changed and drops one that's gone", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "grows", [created("a")], 1000);
    deliver(folder, "goes", [record("gone")]);
    deliver(folder, "stuck", [record("c")]);
    folder.failReading("stuck", "NotReadableError");
    await leaveWhenStuck(await openTabWithoutItsFolder(), folder);

    folder.failReading("stuck", undefined);
    deliver(folder, "grows", [created("a"), record("b")], 2000);
    folder.files.delete("goes");
    const back = await openTabWithoutItsFolder();
    await back.readFolderInFull(folder, { onProgress() {} });

    expect(ids(back).sort()).toEqual(["a", "b", "c"]);
  });

  it("takes nothing from another folder once told to forget it", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "same name", [created("theirs")], 1000);
    deliver(folder, "stuck", [record("b")]);
    folder.failReading("stuck", "NotReadableError");
    await leaveWhenStuck(await openTabWithoutItsFolder(), folder);

    const back = await openTabWithoutItsFolder();
    await back.forgetFullRead();
    const chosen = createInMemoryFolder();
    deliver(chosen, "same name", [created("ours")], 1000);
    await back.readFolderInFull(chosen, { onProgress() {} });

    expect(ids(back)).toEqual(["ours"]);
  });

  it("tries a file it couldn't read again, without stopping at it", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "stuck", [record("b", OCT_31 + 1)]);
    deliver(folder, "second", [created("a")]);
    folder.failReading("stuck", "NotReadableError");
    const changeLog = await openTabWithoutItsFolder();
    const counts: string[] = [];

    const opened = await changeLog.readFolderInFull(folder, {
      onProgress: ({ read, of }) => counts.push(`${read} of ${of}`),
      waitToRetry: async () => folder.failReading("stuck", undefined),
    });

    expect(opened).toBe("opened");
    expect(counts).toEqual(["0 of 2", "1 of 2", "1 of 2", "2 of 2"]);
    expect(ids(changeLog)).toEqual(["a", "b"]);
  });

  it("keeps the good lines of a torn file, and reads it again on the next check", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    const whole = JSON.stringify(created("a"));
    folder.deliver("torn", `${whole}\n{"id":"cut o`);
    const changeLog = await openTabWithoutItsFolder();

    await changeLog.readFolderInFull(folder, { onProgress() {} });
    expect(ids(changeLog)).toEqual(["a"]);

    folder.deliver("torn", `${whole}\n${JSON.stringify(record("b"))}\n`);
    await changeLog.checkFolder("full");
    expect(ids(changeLog).sort()).toEqual(["a", "b"]);
  });

  it("opens nothing from files with no Budget, and keeps none of them", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "laptop", [record("a")]);
    const changeLog = await openTabWithoutItsFolder();

    const opened = await changeLog.readFolderInFull(folder, {
      onProgress() {},
    });

    expect(opened).toBe("no-budget");
    expect(changeLog.readAll()).toEqual([]);
    expect(await changeLog.fullReadUnderway()).toBe(false);
  });

  it("stays out of the folder while reading, so a check can't bring in part of it", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "first", [created("a")]);
    deliver(folder, "stuck", [record("b")]);
    folder.failReading("stuck", "NotReadableError");
    const changeLog = await openTabWithoutItsFolder();

    await leaveWhenStuck(changeLog, folder);
    await changeLog.checkFolder("full");

    expect(changeLog.readAll()).toEqual([]);
  });

  it("is in the folder afterwards: it writes there and won't read it all again", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "laptop", [created("a")]);
    const changeLog = await openTabWithoutItsFolder();
    await changeLog.readFolderInFull(folder, { onProgress() {} });
    folder.clearReads();

    await changeLog.checkFolder("full");
    expect(folder.reads()).toEqual([]);

    changeLog.append([record("b", NOV_1)]);
    await settled(changeLog);
    expect(lines(folder.files.get("phone-2026-11.jsonl"))).toHaveLength(1);
    expect(lines(folder.files.get("laptop"))).toHaveLength(1);
  });

  it("rejects when the folder can't be listed, keeping what it read", async () => {
    const { folder, openTabWithoutItsFolder } = aBrowser();
    deliver(folder, "first", [created("a")]);
    deliver(folder, "stuck", [record("b")]);
    folder.failReading("stuck", "NotReadableError");
    const changeLog = await openTabWithoutItsFolder();

    await expect(
      changeLog.readFolderInFull(folder, {
        onProgress() {},
        waitToRetry: async () => folder.failWith("NotFoundError"),
      }),
    ).rejects.toThrow();

    expect(changeLog.readAll()).toEqual([]);
    expect(await changeLog.fullReadUnderway()).toBe(true);
  });

  /** Reads as far as the one stuck file, then waits forever, as a tab being left does. */
  async function leaveWhenStuck(
    changeLog: DataFolderChangeLog,
    folder: InMemoryFolder,
  ) {
    await new Promise<void>((left) => {
      void changeLog.readFolderInFull(folder, {
        onProgress() {},
        waitToRetry: () => {
          left();
          return new Promise(() => {});
        },
      });
    });
  }
});

function budgetCreated(budgetId: string, wallTime = OCT_31) {
  return {
    ...record(`created-${budgetId}`, wallTime, "laptop"),
    subjectId: budgetId,
    type: "BudgetCreated",
  };
}

/** A browser with Budget "mine" in the Local Copy, all of it written to its folder. */
async function aBudgetInItsFolder() {
  const browser = aBrowser();
  const changeLog = await browser.openTab();
  changeLog.append([budgetCreated("mine"), record("my-change")]);
  await settled(changeLog);
  return { ...browser, changeLog };
}

/** Another folder, already holding Budget "theirs". */
function theirFolder() {
  const folder = createInMemoryFolder();
  deliver(folder, "their-file", [
    budgetCreated("theirs"),
    record("their-change"),
  ]);
  return folder;
}

describe("telling what a chosen folder holds", () => {
  it("knows this Budget by the id on its BudgetCreated, whatever else differs", async () => {
    const { changeLog } = await aBudgetInItsFolder();
    const chosen = createInMemoryFolder();
    deliver(chosen, "a", [record("no-budget-here")]);
    deliver(chosen, "b", [budgetCreated("mine", NOV_1)]);

    expect(await changeLog.whatFolderHolds(chosen)).toBe("this-budget");
  });

  it("knows a different Budget, and brings none of it in", async () => {
    const { changeLog } = await aBudgetInItsFolder();

    expect(await changeLog.whatFolderHolds(theirFolder())).toBe(
      "another-budget",
    );
    expect(ids(changeLog)).toEqual(["created-mine", "my-change"]);
  });

  it("says there's no Budget for an empty folder and for files with no BudgetCreated", async () => {
    const { changeLog } = await aBudgetInItsFolder();
    const noBudget = createInMemoryFolder();
    deliver(noBudget, "a", [record("stray")]);

    expect(await changeLog.whatFolderHolds(createInMemoryFolder())).toBe(
      "no-budget",
    );
    expect(await changeLog.whatFolderHolds(noBudget)).toBe("no-budget");
  });

  it("doesn't call a folder empty until it could read every file", async () => {
    const { changeLog } = await aBudgetInItsFolder();
    const chosen = theirFolder();
    chosen.failReading("their-file", "NotReadableError");

    const holds = await changeLog.whatFolderHolds(chosen, async () => {
      chosen.failReading("their-file", undefined);
    });

    expect(holds).toBe("another-budget");
  });

  it("calls any Budget another one when the Local Copy has none", async () => {
    const { openTabWithoutItsFolder } = aBrowser();
    const changeLog = await openTabWithoutItsFolder();

    expect(await changeLog.whatFolderHolds(theirFolder())).toBe(
      "another-budget",
    );
  });
});

describe("whether changes are still unsaved", () => {
  it("is so only while a record hasn't reached the folder", async () => {
    const { changeLog, folder } = await aBudgetInItsFolder();
    expect(await changeLog.hasUnsavedChanges()).toBe(false);

    folder.failWith("NotFoundError");
    changeLog.append([record("held", NOV_1)]);
    await settled(changeLog);
    expect(await changeLog.hasUnsavedChanges()).toBe(true);

    folder.failWith(undefined);
    changeLog.append([record("next", NOV_1 + 1)]);
    await vi.waitFor(async () =>
      expect(await changeLog.hasUnsavedChanges()).toBe(false),
    );
  });
});

describe("a background check finding a different Budget", () => {
  it("merges nothing, says so and stops using the folder", async () => {
    const { changeLog, folder, onTwoBudgets } = await aBudgetInItsFolder();
    deliver(folder, "their-file", [budgetCreated("theirs")]);
    deliver(folder, "their-other-file", [record("their-change")]);
    const appends = folder.appends();

    await changeLog.checkFolder("full");

    expect(onTwoBudgets).toHaveBeenCalledOnce();
    expect(ids(changeLog)).toEqual(["created-mine", "my-change"]);

    changeLog.append([record("after", NOV_1)]);
    await settled(changeLog);
    expect(folder.appends()).toBe(appends);
  });

  it("merges nothing from a file that arrives with another Budget in a quick check", async () => {
    const { changeLog, folder, onTwoBudgets } = await aBudgetInItsFolder();
    await changeLog.checkFolder("full");
    deliver(folder, "their-file", [record("first"), budgetCreated("theirs")]);

    await changeLog.checkFolder("quick");

    expect(onTwoBudgets).toHaveBeenCalledOnce();
    expect(ids(changeLog)).not.toContain("first");
  });

  it("finds it again after a reopen, because nothing was marked as read", async () => {
    const { changeLog, folder, openTab, onTwoBudgets } =
      await aBudgetInItsFolder();
    deliver(folder, "their-file", [budgetCreated("theirs")]);
    await changeLog.checkFolder("full");

    const reopened = await openTab();
    await reopened.checkFolder("full");

    expect(onTwoBudgets).toHaveBeenCalledTimes(2);
    expect(ids(reopened)).toEqual(["created-mine", "my-change"]);
  });

  it("merges this Budget's own BudgetCreated from another device as usual", async () => {
    const { changeLog, folder, onTwoBudgets } = await aBudgetInItsFolder();
    deliver(folder, "other-device", [
      { ...budgetCreated("mine"), id: "created-again" },
      record("from-other-device", NOV_1, "laptop"),
    ]);

    await changeLog.checkFolder("full");

    expect(onTwoBudgets).not.toHaveBeenCalled();
    expect(ids(changeLog)).toContain("from-other-device");
  });

  it("stops for two Budgets even with none in the Local Copy", async () => {
    const { openTabWithoutItsFolder, onTwoBudgets } = aBrowser();
    const changeLog = await openTabWithoutItsFolder();
    const chosen = createInMemoryFolder();
    changeLog.startNewBudget(chosen);
    await settled(changeLog);
    deliver(chosen, "one", [budgetCreated("one")]);
    deliver(chosen, "two", [budgetCreated("two")]);

    await changeLog.checkFolder("full");

    expect(onTwoBudgets).toHaveBeenCalledOnce();
    expect(ids(changeLog)).toEqual([]);
  });
});

describe("a full read finding two Budgets", () => {
  it("opens neither and keeps none of it", async () => {
    const { openTabWithoutItsFolder } = aBrowser();
    const changeLog = await openTabWithoutItsFolder();
    const chosen = theirFolder();
    deliver(chosen, "another", [budgetCreated("also-theirs")]);

    const opened = await changeLog.readFolderInFull(chosen, {
      onProgress() {},
    });

    expect(opened).toBe("two-budgets");
    expect(ids(changeLog)).toEqual([]);
    expect(await changeLog.fullReadUnderway()).toBe(false);
  });
});

describe("replacing the Local Copy with a folder's Budget", () => {
  it("swaps the Budget, counting as it goes, and leaves the old folder as it was", async () => {
    const { changeLog, folder, openTabWithoutItsFolder } =
      await aBudgetInItsFolder();
    const oldFiles = new Map(folder.files);
    const chosen = theirFolder();
    const progress = vi.fn();

    const outcome = await changeLog.replaceWithFolder(chosen, {
      onProgress: progress,
    });

    expect(outcome).toBe("replaced");
    expect(progress).toHaveBeenLastCalledWith({ read: 1, of: 1 });
    expect(ids(changeLog)).toEqual(["created-theirs", "their-change"]);
    expect(ids(await openTabWithoutItsFolder())).toEqual([
      "created-theirs",
      "their-change",
    ]);
    expect(folder.files).toEqual(oldFiles);
  });

  it("is then in that folder: it writes there and won't read it all again", async () => {
    const { changeLog, folder, openTabWithoutItsFolder } =
      await aBudgetInItsFolder();
    const chosen = theirFolder();
    await changeLog.replaceWithFolder(chosen, { onProgress() {} });
    const oldAppends = folder.appends();

    changeLog.append([record("next", NOV_1)]);
    await settled(changeLog);
    expect(chosen.appends()).toBe(1);
    expect(folder.appends()).toBe(oldAppends);

    chosen.clearReads();
    const reopened = await openTabWithoutItsFolder();
    reopened.returnToFolder(chosen);
    await reopened.checkFolder("full");
    expect(chosen.reads()).not.toContain("their-file");
  });

  it("refuses while changes are unsaved, and takes them away only when told to", async () => {
    const { changeLog, folder, openTabWithoutItsFolder } =
      await aBudgetInItsFolder();
    folder.failWith("NotFoundError");
    changeLog.append([record("held", NOV_1)]);
    await settled(changeLog);
    const chosen = theirFolder();

    expect(await changeLog.replaceWithFolder(chosen, { onProgress() {} })).toBe(
      "unsaved",
    );
    expect(ids(changeLog)).toContain("held");

    expect(
      await changeLog.replaceWithFolder(chosen, {
        discardUnsaved: true,
        onProgress() {},
      }),
    ).toBe("replaced");
    await settled(changeLog);
    expect(await changeLog.hasUnsavedChanges()).toBe(false);
    expect(chosen.files.get("their-file")).not.toContain("held");
    expect(ids(await openTabWithoutItsFolder())).not.toContain("held");
  });

  it("changes nothing when the folder turns out to hold two Budgets or none", async () => {
    const { changeLog } = await aBudgetInItsFolder();
    const two = theirFolder();
    deliver(two, "another", [budgetCreated("also-theirs")]);
    const stray = createInMemoryFolder();
    deliver(stray, "a", [record("stray")]);

    expect(await changeLog.replaceWithFolder(two, { onProgress() {} })).toBe(
      "two-budgets",
    );
    expect(await changeLog.replaceWithFolder(stray, { onProgress() {} })).toBe(
      "no-budget",
    );
    expect(ids(changeLog)).toEqual(["created-mine", "my-change"]);
  });

  it("leaves the Local Copy alone when the folder can't be listed", async () => {
    const { changeLog } = await aBudgetInItsFolder();
    const gone = theirFolder();
    gone.failWith("NotFoundError");

    await expect(
      changeLog.replaceWithFolder(gone, { onProgress() {} }),
    ).rejects.toThrow();
    expect(ids(changeLog)).toEqual(["created-mine", "my-change"]);
  });
});

describe("putting the Budget in a folder with none", () => {
  it("writes the whole Budget there, including changes not yet saved", async () => {
    const { changeLog, folder } = await aBudgetInItsFolder();
    folder.failWith("NotFoundError");
    changeLog.append([record("held", NOV_1)]);
    await settled(changeLog);
    const chosen = createInMemoryFolder();

    await changeLog.putBudgetIn(chosen);
    await settled(changeLog);

    const written = [...chosen.files.values()].flatMap(lines).map((r) => r.id);
    expect(written.sort()).toEqual(["created-mine", "held", "my-change"]);
    expect(await changeLog.hasUnsavedChanges()).toBe(false);
    expect(changeLog.saveState()).toEqual({ status: "saved" });
  });
});

describe("starting a new Budget in a folder with none", () => {
  it("empties the Local Copy and keeps what's written next in that folder", async () => {
    const { changeLog, folder, openTabWithoutItsFolder } =
      await aBudgetInItsFolder();
    const oldFiles = new Map(folder.files);
    const chosen = createInMemoryFolder();

    changeLog.startNewBudget(chosen);
    expect(ids(changeLog)).toEqual([]);
    changeLog.append([budgetCreated("new")]);
    await settled(changeLog);

    expect([...chosen.files.values()].flatMap(lines).map((r) => r.id)).toEqual([
      "created-new",
    ]);
    expect(folder.files).toEqual(oldFiles);
    expect(ids(await openTabWithoutItsFolder())).toEqual(["created-new"]);
  });
});
