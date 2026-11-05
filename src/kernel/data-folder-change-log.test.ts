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

    returned.keepInFolder(folder);
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
