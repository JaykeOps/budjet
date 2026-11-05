import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  type ChosenFolder,
  createFolderChooser,
  type FolderScreen,
} from "./folder-chooser";
import type { ChangeRecord } from "./kernel/change-log";
import { openDataFolderChangeLog } from "./kernel/data-folder-change-log";
import {
  createInMemoryFolder,
  type InMemoryFolder,
} from "./kernel/in-memory-folder";
import { budgetIds } from "./slices/budget-setup/records";

const NOW = Date.UTC(2026, 10, 1);

function record(id: string, type = "Named", subjectId = "thing") {
  return {
    id,
    subjectId,
    deviceId: "phone",
    timestamp: { wallTime: NOW, counter: 0 },
    type,
    payload: {},
  } satisfies ChangeRecord;
}

const fileOf = (records: readonly ChangeRecord[]) =>
  records.map((r) => `${JSON.stringify(r)}\n`).join("");

function chosen(folder: InMemoryFolder, name = "Picked"): ChosenFolder {
  return { name, folder, remember: vi.fn(async () => {}) };
}

/** A folder holding this Budget, or another. */
function holding(budgetId: string) {
  const folder = createInMemoryFolder();
  folder.deliver(
    `${budgetId}-file`,
    fileOf([
      record(`created-${budgetId}`, "BudgetCreated", budgetId),
      record(`change-in-${budgetId}`),
    ]),
  );
  return folder;
}

/** The app with Budget "mine" in its Local Copy, its folder given or lost. */
async function theApp({
  unsaved = false,
  hasBudget = true,
}: {
  unsaved?: boolean;
  hasBudget?: boolean;
} = {}) {
  const home = createInMemoryFolder();
  const screens: FolderScreen[] = [];
  const onOpen = vi.fn();
  const picks: ChosenFolder[] = [];
  const indexedDB = new IDBFactory();
  const changeLog = await openDataFolderChangeLog({
    indexedDB,
    folder: home,
    oneTabAtATime: home.oneTabAtATime,
    budgetIds,
    onTwoBudgets() {},
  });
  if (hasBudget) {
    changeLog.append([
      record("created-mine", "BudgetCreated", "mine"),
      record("my-change"),
    ]);
    await vi.waitFor(() =>
      expect(changeLog.saveState()).toEqual({ status: "saved" }),
    );
  }
  if (unsaved) {
    home.failWith("NotFoundError");
    changeLog.append([record("held")]);
    await vi.waitFor(async () =>
      expect(await changeLog.hasUnsavedChanges()).toBe(true),
    );
  }
  const chooser = createFolderChooser({
    changeLog,
    pick: async (onChoose) => {
      const next = picks.shift();
      if (next) await onChoose(next);
    },
    hasBudget: () => budgetIds(changeLog.readAll()).length > 0,
    show: (screen) => screens.push(screen),
    onOpen,
  });
  const ids = () => changeLog.readAll().map(({ id }) => id);
  const screen = <Kind extends FolderScreen["kind"]>(kind: Kind) => {
    const last = screens.at(-1);
    expect(last?.kind).toBe(kind);
    return last as Extract<FolderScreen, { kind: Kind }>;
  };
  return { changeLog, chooser, screens, screen, onOpen, picks, ids, home };
}

const written = (folder: InMemoryFolder) =>
  [...folder.files.values()]
    .flatMap((text) => text.split("\n").filter(Boolean))
    .map((line) => JSON.parse(line).id);

describe("choosing a folder holding the same Budget", () => {
  for (const unsaved of [false, true]) {
    it(`opens and merges what's new, ${unsaved ? "writing held changes" : "all saved"}`, async () => {
      const { chooser, screens, onOpen, ids } = await theApp({ unsaved });
      const folder = holding("mine");
      const picked = chosen(folder);

      await chooser.chosen(picked);

      expect(screens).toEqual([]);
      expect(onOpen).toHaveBeenCalledWith("kept");
      expect(picked.remember).toHaveBeenCalled();
      await vi.waitFor(() => expect(ids()).toContain("change-in-mine"));
      if (unsaved) {
        await vi.waitFor(() => expect(written(folder)).toContain("held"));
      }
    });
  }
});

describe("choosing a folder holding a different Budget", () => {
  it("with all saved, shows progress and replaces the Local Copy", async () => {
    const { chooser, screens, onOpen, ids, home } = await theApp();
    const before = new Map(home.files);
    const picked = chosen(holding("theirs"));

    await chooser.chosen(picked);

    expect(screens.map(({ kind }) => kind)).toContain("reading");
    expect(screens.at(-1)).toEqual({
      kind: "reading",
      progress: { read: 1, of: 1 },
    });
    expect(onOpen).toHaveBeenCalledWith("replaced");
    expect(picked.remember).toHaveBeenCalled();
    expect(ids()).toEqual(["change-in-theirs", "created-theirs"].sort());
    expect(home.files).toEqual(before);
  });

  it("with unsaved changes, refuses and changes nothing", async () => {
    const { chooser, screen, onOpen, ids } = await theApp({ unsaved: true });
    const picked = chosen(holding("theirs"));

    await chooser.chosen(picked);

    screen("refused");
    expect(onOpen).not.toHaveBeenCalled();
    expect(picked.remember).not.toHaveBeenCalled();
    expect(ids()).toContain("held");
  });

  it("Choose another goes through the same check", async () => {
    const { chooser, screen, onOpen, picks } = await theApp({ unsaved: true });
    await chooser.chosen(chosen(holding("theirs")));
    picks.push(chosen(holding("mine")));

    await screen("refused").chooseAnother();

    expect(onOpen).toHaveBeenCalledWith("kept");
  });

  it("Discard my changes and open it replaces the Local Copy", async () => {
    const { chooser, screen, onOpen, ids, changeLog } = await theApp({
      unsaved: true,
    });
    await chooser.chosen(chosen(holding("theirs")));

    await screen("refused").discardAndOpen();

    expect(onOpen).toHaveBeenCalledWith("replaced");
    expect(ids()).not.toContain("held");
    expect(await changeLog.hasUnsavedChanges()).toBe(false);
  });

  it("stops at a folder holding two Budgets, and replaces nothing", async () => {
    const { chooser, screen, onOpen, ids } = await theApp();
    const two = holding("theirs");
    two.deliver(
      "also",
      fileOf([record("created-also", "BudgetCreated", "also")]),
    );

    await chooser.chosen(chosen(two, "Shared"));

    expect(screen("two-budgets").name).toBe("Shared");
    expect(onOpen).not.toHaveBeenCalled();
    expect(ids()).toContain("my-change");
  });

  it("says so if the folder can't be read part way, and replaces nothing", async () => {
    const { chooser, screen, ids } = await theApp();
    const flaky = holding("theirs");
    const list = flaky.list;
    flaky.list = vi
      .fn(list)
      .mockImplementationOnce(list)
      .mockRejectedValue(new DOMException("Gone", "NotFoundError"));

    await chooser.chosen(chosen(flaky, "Flaky"));

    expect(screen("unreadable").name).toBe("Flaky");
    expect(ids()).toContain("my-change");
  });
});

describe("choosing a folder with no Budget", () => {
  it("says so and never moves on by itself", async () => {
    const { chooser, screen, onOpen } = await theApp();
    const picked = chosen(createInMemoryFolder(), "Empty");

    await chooser.chosen(picked);

    expect(screen("no-budget").name).toBe("Empty");
    expect(onOpen).not.toHaveBeenCalled();
    expect(picked.remember).not.toHaveBeenCalled();
  });

  it("offers Put my Budget here only when a Local Copy exists", async () => {
    const { chooser, screen } = await theApp({ hasBudget: false });

    await chooser.chosen(chosen(createInMemoryFolder()));

    expect(screen("no-budget").putHere).toBeUndefined();
  });

  it("Put my Budget here writes all of it, with unsaved changes too", async () => {
    const { chooser, screen, onOpen } = await theApp({ unsaved: true });
    const folder = createInMemoryFolder();
    const picked = chosen(folder);
    await chooser.chosen(picked);

    await screen("no-budget").putHere?.();

    expect(onOpen).toHaveBeenCalledWith("kept");
    expect(picked.remember).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(written(folder).sort()).toEqual([
        "created-mine",
        "held",
        "my-change",
      ]),
    );
  });

  it("Start a new Budget, all saved, empties the Local Copy for setup", async () => {
    const { chooser, screen, onOpen, ids } = await theApp();
    const picked = chosen(createInMemoryFolder());
    await chooser.chosen(picked);

    await screen("no-budget").startNew();

    expect(onOpen).toHaveBeenCalledWith("new");
    expect(picked.remember).toHaveBeenCalled();
    expect(ids()).toEqual([]);
  });

  it("Start a new Budget with unsaved changes is refused until they're discarded", async () => {
    const { chooser, screen, onOpen, ids } = await theApp({ unsaved: true });
    await chooser.chosen(chosen(createInMemoryFolder()));

    await screen("no-budget").startNew();

    expect(onOpen).not.toHaveBeenCalled();
    expect(ids()).toContain("held");

    await screen("start-refused").discardAndStart();

    expect(onOpen).toHaveBeenCalledWith("new");
    expect(ids()).toEqual([]);
  });
});

describe("the stop for two Budgets in one folder", () => {
  it("offers a clean folder, which goes through the same check", async () => {
    const { chooser, screen, onOpen, picks } = await theApp();
    chooser.showTwoBudgets("Shared");
    picks.push(chosen(holding("mine")));

    await screen("two-budgets").chooseAnother();

    expect(onOpen).toHaveBeenCalledWith("kept");
  });
});
