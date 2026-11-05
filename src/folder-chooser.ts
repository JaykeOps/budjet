/**
 * What happens once a folder is chosen for a Budget, on every path that can
 * choose one: the spec's folder table. Nothing from the folder enters the Local
 * Copy until it's known to hold this Budget or is meant to replace it.
 */
import type {
  DataFolderChangeLog,
  Folder,
  FullReadProgress,
} from "./kernel/data-folder-change-log";

export type ChosenFolder = {
  name: string;
  folder: Folder;
  /** Remembers it as the folder this Budget is kept in, for this and later visits. */
  remember(): Promise<void>;
};

type Act = () => Promise<void>;

export type FolderScreen =
  | { kind: "reading"; progress: FullReadProgress }
  | {
      kind: "no-budget";
      name: string;
      chooseAnother: Act;
      startNew: Act;
      /** Absent with no Local Copy to put there. */
      putHere?: Act;
    }
  | { kind: "refused"; chooseAnother: Act; discardAndOpen: Act }
  | { kind: "start-refused"; chooseAnother: Act; discardAndStart: Act }
  | { kind: "two-budgets"; name: string; chooseAnother: Act }
  | { kind: "unreadable"; name: string; chooseAnother: Act };

/** `new` means an empty Local Copy with a folder already chosen, so setup comes next. */
export type Opened = "kept" | "replaced" | "new";

export type FolderChooser = {
  /** Takes a chosen folder through the table, ending in `onOpen` or on a screen. */
  chosen(picked: ChosenFolder): Promise<void>;
  showNoBudget(picked: ChosenFolder): void;
  showTwoBudgets(folderName: string): void;
};

export function createFolderChooser({
  changeLog,
  hasBudget,
  pick,
  show,
  onOpen,
}: {
  changeLog: DataFolderChangeLog;
  hasBudget: () => boolean;
  /** Opens the folder picker. Cancelling does nothing. */
  pick: (onChoose: (picked: ChosenFolder) => Promise<void>) => Promise<void>;
  show: (screen: FolderScreen) => void;
  onOpen: (opened: Opened) => void;
}): FolderChooser {
  const chooseAnother = () => pick(chosen);

  async function chosen(picked: ChosenFolder) {
    const holds = await changeLog.whatFolderHolds(picked.folder);
    if (holds === "this-budget") {
      await picked.remember();
      changeLog.keepInFolder(picked.folder);
      void changeLog.checkFolder("full");
      onOpen("kept");
    } else if (holds === "no-budget") {
      showNoBudget(picked);
    } else if (await changeLog.hasUnsavedChanges()) {
      showRefused(picked);
    } else {
      await replace(picked, false);
    }
  }

  async function replace(picked: ChosenFolder, discardUnsaved: boolean) {
    try {
      const outcome = await changeLog.replaceWithFolder(picked.folder, {
        discardUnsaved,
        onProgress: (progress) => show({ kind: "reading", progress }),
      });
      if (outcome === "replaced") {
        await picked.remember();
        onOpen("replaced");
      } else if (outcome === "unsaved") showRefused(picked);
      else if (outcome === "no-budget") showNoBudget(picked);
      else showTwoBudgets(picked.name);
    } catch (error) {
      console.error("Crownkeep could not read the folder", error);
      show({ kind: "unreadable", name: picked.name, chooseAnother });
    }
  }

  async function startNew(picked: ChosenFolder) {
    await picked.remember();
    changeLog.startNewBudget(picked.folder);
    onOpen("new");
  }

  function showRefused(picked: ChosenFolder) {
    show({
      kind: "refused",
      chooseAnother,
      discardAndOpen: () => replace(picked, true),
    });
  }

  function showNoBudget(picked: ChosenFolder) {
    show({
      kind: "no-budget",
      name: picked.name,
      chooseAnother,
      async startNew() {
        if (await changeLog.hasUnsavedChanges()) {
          show({
            kind: "start-refused",
            chooseAnother,
            discardAndStart: () => startNew(picked),
          });
        } else {
          await startNew(picked);
        }
      },
      putHere: hasBudget()
        ? async () => {
            await picked.remember();
            await changeLog.putBudgetIn(picked.folder);
            onOpen("kept");
          }
        : undefined,
    });
  }

  function showTwoBudgets(name: string) {
    show({ kind: "two-budgets", name, chooseAnother });
  }

  return { chosen, showNoBudget, showTwoBudgets };
}
