import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { ChangeLog, ChangeRecord, SaveState } from "./change-log";
import { openDataFolderChangeLog } from "./data-folder-change-log";
import { createInMemoryFolder, type InMemoryFolder } from "./in-memory-folder";
import { rememberedFolderHandle } from "./indexed-db-change-log";

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
