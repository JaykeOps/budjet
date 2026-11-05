import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { ChangeLog, SaveState } from "./change-log";
import {
  type DataFolderChangeLog,
  openDataFolderChangeLog,
} from "./data-folder-change-log";
import {
  askToOpen,
  type ReturningFolder,
  reconnect,
  tryFolderOnReturn,
} from "./folder-on-return";
import { createInMemoryFolder, type InMemoryFolder } from "./in-memory-folder";

/** A remembered folder that fails with each of these in turn, then is fine. */
function aFolder({
  failures = [],
  allow = true,
}: {
  failures?: string[];
  allow?: boolean;
} = {}): ReturningFolder {
  const left = [...failures];
  return {
    name: "Budget folder",
    async reach() {
      const failure = left.shift();
      if (failure) throw new DOMException("Can't reach it", failure);
    },
    askForAccess: async () => allow,
  };
}

describe("returning to a remembered folder", () => {
  it("opens the Budget when the folder can be reached", async () => {
    expect(await tryFolderOnReturn(aFolder())).toBe("open");
  });

  it("reads NotAllowedError as access having lapsed", async () => {
    const folder = aFolder({ failures: ["NotAllowedError"] });

    expect(await tryFolderOnReturn(folder)).toBe("lapsed");
  });

  it("reads NotFoundError as the folder being lost", async () => {
    const folder = aFolder({ failures: ["NotFoundError"] });

    expect(await tryFolderOnReturn(folder)).toBe("lost");
  });

  it("opens from the Local Copy on any other failure, leaving it to the save state", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const folder = aFolder({ failures: ["NotReadableError"] });

    expect(await tryFolderOnReturn(folder)).toBe("open");
  });
});

describe("asking to open after access lapsed", () => {
  it("opens once the browser gives access", async () => {
    expect(await askToOpen(aFolder())).toBe("open");
  });

  it("stays lapsed when the user declines", async () => {
    const reach = vi.fn();
    const folder = { ...aFolder({ allow: false }), reach };

    expect(await askToOpen(folder)).toBe("lapsed");
    expect(reach).not.toHaveBeenCalled();
  });

  it("finds a lost folder by trying it, though the browser gave access", async () => {
    const folder = aFolder({ failures: ["NotFoundError"] });

    expect(await askToOpen(folder)).toBe("lost");
  });

  it("stays lapsed when asking itself is refused", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const folder = {
      ...aFolder(),
      askForAccess: () =>
        Promise.reject(new DOMException("No gesture", "SecurityError")),
    };

    expect(await askToOpen(folder)).toBe("lapsed");
  });
});

describe("reconnecting while the Budget is open", () => {
  const held = {
    id: "a",
    subjectId: "thing",
    deviceId: "phone",
    timestamp: { wallTime: Date.UTC(2026, 9, 31), counter: 0 },
    type: "Named",
    payload: { name: "a" },
  };

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

  /** A retry stays unsaved until it finishes, so settling isn't enough. */
  const nowSaved = (changeLog: ChangeLog) =>
    vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({ status: "saved" }),
    );

  /** A Budget whose write of one change failed with this error. */
  async function holdingAChange(errorName: string) {
    const folder = createInMemoryFolder();
    const changeLog = await openDataFolderChangeLog({
      indexedDB: new IDBFactory(),
      folder,
      oneTabAtATime: folder.oneTabAtATime,
    });
    folder.failWith(errorName);
    changeLog.append([held]);
    await settled(changeLog);
    return { folder, changeLog };
  }

  function ways(
    changeLog: DataFolderChangeLog,
    folder: InMemoryFolder,
    returning: ReturningFolder,
    chooseFolder = vi.fn(async () => {}),
  ) {
    return {
      chooseFolder,
      options: {
        folder: returning,
        retry: () => changeLog.returnToFolder(folder),
        chooseFolder,
      },
    };
  }

  it("asks for permission after access lapsed, then writes what was held", async () => {
    const { folder, changeLog } = await holdingAChange("NotAllowedError");
    const returning = aFolder();
    const askForAccess = vi.spyOn(returning, "askForAccess");
    const { chooseFolder, options } = ways(changeLog, folder, returning);
    folder.failWith(undefined);

    await reconnect("access-lapsed", options);
    await nowSaved(changeLog);

    expect(askForAccess).toHaveBeenCalledOnce();
    expect(chooseFolder).not.toHaveBeenCalled();
    expect(folder.files.get("phone-2026-10.jsonl")).toContain('"id":"a"');
  });

  it("stays unsaved and writes nothing when permission is declined", async () => {
    const { folder, changeLog } = await holdingAChange("NotAllowedError");
    const { options } = ways(changeLog, folder, aFolder({ allow: false }));
    folder.failWith(undefined);

    await reconnect("access-lapsed", options);

    expect(changeLog.saveState()).toEqual({
      status: "unsaved",
      reason: "access-lapsed",
    });
    expect(folder.files.size).toBe(0);
  });

  it("moves on to the folder being gone when access returns but the folder doesn't", async () => {
    const { folder, changeLog } = await holdingAChange("NotAllowedError");
    const { chooseFolder, options } = ways(
      changeLog,
      folder,
      aFolder({ failures: ["NotFoundError"] }),
    );
    folder.failWith("NotFoundError");

    await reconnect("access-lapsed", options);

    await vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({
        status: "unsaved",
        reason: "folder-gone",
      }),
    );
    expect(chooseFolder).not.toHaveBeenCalled();
  });

  it("offers the picker when the folder is gone, without asking for permission", async () => {
    const { folder, changeLog } = await holdingAChange("NotFoundError");
    const chosen = createInMemoryFolder();
    const returning = aFolder();
    const askForAccess = vi.spyOn(returning, "askForAccess");
    const { options } = ways(
      changeLog,
      folder,
      returning,
      vi.fn(async () => changeLog.keepInFolder(chosen)),
    );

    await reconnect("folder-gone", options);
    await nowSaved(changeLog);

    expect(askForAccess).not.toHaveBeenCalled();
    expect(chosen.files.get("phone-2026-10.jsonl")).toContain('"id":"a"');
  });

  it("stays unsaved when the picker is cancelled", async () => {
    const { folder, changeLog } = await holdingAChange("NotFoundError");
    const { options } = ways(changeLog, folder, aFolder());

    await reconnect("folder-gone", options);

    expect(changeLog.saveState()).toEqual({
      status: "unsaved",
      reason: "folder-gone",
    });
  });

  it("tries the same folder again after any other failure", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { folder, changeLog } = await holdingAChange("NoModificationAllowed");
    const { chooseFolder, options } = ways(changeLog, folder, aFolder());
    folder.failWith(undefined);

    await reconnect("write-failed", options);
    await nowSaved(changeLog);

    expect(chooseFolder).not.toHaveBeenCalled();
  });
});
