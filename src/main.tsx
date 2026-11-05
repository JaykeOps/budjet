import "./ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./install-offer";
import { FolderScreen } from "./FolderScreen";
import { chooseFolder, hasFolderPicker } from "./first-run/browser";
import { GettingYourBudget } from "./first-run/FirstRun";
import { type ChosenFolder, createFolderChooser } from "./folder-chooser";
import { browserFolder, returningFolder } from "./kernel/browser-folder";
import { createChangeLogWriter, type UnsavedReason } from "./kernel/change-log";
import {
  type FullReadProgress,
  openDataFolderChangeLog,
} from "./kernel/data-folder-change-log";
import { scheduleFolderChecks } from "./kernel/folder-checks";
import {
  reconnect,
  timeBoxed,
  tryFolderOnReturn,
} from "./kernel/folder-on-return";
import {
  openIndexedDbChangeLog,
  openIndexedDbDeviceId,
  rememberedFolderHandle,
  rememberFolderHandle,
  upgradeDatabase,
} from "./kernel/indexed-db-change-log";
import { ReturnToFolder } from "./ReturnToFolder";
import { budget } from "./slices/budget-setup";
import { budgetIds } from "./slices/budget-setup/records";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");
const reactRoot = createRoot(root);

// Rendering replaces this message, if it ever had to show.
await upgradeDatabase({
  onBlocked() {
    root.innerHTML =
      '<p role="alert">Close Crownkeep\'s other tabs to finish updating.</p>';
  },
});

// Every record is read from browser storage before the first render, so a
// returning user opens straight into their Budget.
const [
  {
    changeLog,
    keepInFolder,
    folderConnection,
    folderOffer,
    returning,
    unread,
    checkFolder,
  },
  deviceId,
] = await Promise.all([
  hasFolderPicker()
    ? openFolderStorage()
    : {
        changeLog: await openIndexedDbChangeLog(),
        keepInFolder: undefined,
        folderConnection: undefined,
        folderOffer: undefined,
        returning: undefined,
        unread: undefined,
        checkFolder: undefined,
      },
  openIndexedDbDeviceId(),
]);
const writer = createChangeLogWriter(changeLog, deviceId);
let checksScheduled = false;

function showApp({ folderChosen = false } = {}) {
  reactRoot.render(
    <StrictMode>
      <App
        writer={writer}
        keepInFolder={keepInFolder}
        folderChosen={folderChosen}
        folderConnection={folderConnection}
        folderOffer={folderOffer}
      />
    </StrictMode>,
  );
  // Only now: a returning user is back in their folder by the time the app shows.
  if (checkFolder && !checksScheduled) {
    checksScheduled = true;
    scheduleFolderChecks(checkFolder);
  }
}

if (returning) {
  const { folder, keepInIt, choose } = returning;
  const onReturn = await tryFolderOnReturn(folder);
  if (onReturn === "open") {
    keepInIt();
    showApp();
  } else {
    reactRoot.render(
      <StrictMode>
        <ReturnToFolder
          folder={folder}
          firstShown={onReturn}
          onOpen={() => {
            keepInIt();
            showApp();
          }}
          onChoose={choose}
        />
      </StrictMode>,
    );
  }
} else if (unread) {
  const { folder, handle, readFolder, underway, choose, showTwoBudgets } =
    unread;
  const openFrom = async (from: FileSystemDirectoryHandle) => {
    reactRoot.render(
      <StrictMode>
        <GettingYourBudget />
      </StrictMode>,
    );
    const opened = await readFolder(from, (progress) =>
      reactRoot.render(
        <StrictMode>
          <GettingYourBudget progress={progress} />
        </StrictMode>,
      ),
    ).catch((error) =>
      // Back to first run, where choosing the folder again picks up from here.
      console.error("Crownkeep could not read the folder", error),
    );
    if (opened === "two-budgets") showTwoBudgets(from.name);
    else showApp();
  };
  const onReturn = await tryFolderOnReturn(folder);
  if (onReturn === "open") {
    await openFrom(handle);
  } else if (await underway()) {
    reactRoot.render(
      <StrictMode>
        <ReturnToFolder
          folder={folder}
          firstShown={onReturn}
          onOpen={() => openFrom(handle)}
          onChoose={choose}
        />
      </StrictMode>,
    );
  } else {
    showApp();
  }
} else {
  showApp();
}

/**
 * Opens without its folder, so nothing writes there until the user is back in
 * it. A remembered folder with no Budget in the Local Copy may hold one to read:
 * a read that was left, or a cleared Local Copy. If not, it's first run.
 */
async function openFolderStorage() {
  const changeLog = await openDataFolderChangeLog({
    budgetIds,
    onTwoBudgets: () => chooser.showTwoBudgets(current?.name ?? ""),
  });
  const handle = await rememberedFolderHandle();
  let current = handle;
  // A folder that's slow to answer never holds the Budget back.
  const comingBackTo = (from: FileSystemDirectoryHandle) =>
    timeBoxed(returningFolder(from), changeLog.folderFailed);
  // Other tabs hold the old Budget in memory, so they start over.
  const budgetChanged = new BroadcastChannel("crownkeep-budget-changed");
  budgetChanged.onmessage = () => location.reload();
  const toChosen = (chosen: FileSystemDirectoryHandle): ChosenFolder => ({
    name: chosen.name,
    folder: browserFolder(chosen),
    async remember() {
      await rememberFolderHandle(chosen);
      current = chosen;
    },
  });
  const chooser = createFolderChooser({
    changeLog,
    hasBudget: () => budget(changeLog.readAll()) !== undefined,
    pick: (onChoose) => chooseFolder((chosen) => onChoose(toChosen(chosen))),
    show(screen) {
      reactRoot.render(
        <StrictMode>
          <FolderScreen screen={screen} />
        </StrictMode>,
      );
    },
    onOpen(opened) {
      if (opened !== "kept") {
        budgetChanged.postMessage(null);
        // The address may name an Account or a Month of the old Budget.
        history.replaceState(null, "", location.pathname);
      }
      showApp({ folderChosen: opened === "new" });
    },
  });
  const readFolder = (
    chosen: FileSystemDirectoryHandle,
    onProgress: (progress: FullReadProgress) => void,
  ) => changeLog.readFolderInFull(browserFolder(chosen), { onProgress });
  const choose = (chosen: FileSystemDirectoryHandle) =>
    chooser.chosen(toChosen(chosen));
  const keepInFolder = async (
    chosen: FileSystemDirectoryHandle,
    onProgress: (progress: FullReadProgress) => void,
  ) => {
    // Remembered before reading, so leaving resumes this read.
    const remembered = await rememberedFolderHandle();
    if (!(await remembered?.isSameEntry(chosen))) {
      await changeLog.forgetFullRead();
    }
    await rememberFolderHandle(chosen);
    current = chosen;
    const opened = await readFolder(chosen, onProgress);
    if (opened === "no-budget") chooser.showNoBudget(toChosen(chosen));
    if (opened === "two-budgets") chooser.showTwoBudgets(chosen.name);
  };
  const folderConnection = {
    isInFolder: () => current !== undefined,
    async reconnect(reason: UnsavedReason) {
      if (!current) return;
      const folder = current;
      await reconnect(reason, {
        folder: comingBackTo(folder),
        retry: () => {
          changeLog.returnToFolder(browserFolder(folder));
          void changeLog.checkFolder("full");
        },
        chooseFolder: () => chooseFolder(choose),
      });
    },
  };
  // The move has its own refusal: a Budget already here is never replaced or merged.
  const folderOffer = {
    isInFolder: changeLog.inFolder,
    moveIntoFolder: async (chosen: FileSystemDirectoryHandle) => {
      const outcome = await changeLog.moveIntoFolder(
        browserFolder(chosen),
        chosen,
      );
      if (outcome === "moved") {
        current = chosen;
        budgetChanged.postMessage(null);
      }
      return outcome;
    },
  };
  const hasBudget = budget(changeLog.readAll()) !== undefined;
  return {
    changeLog,
    keepInFolder,
    folderConnection,
    folderOffer,
    returning:
      handle && hasBudget
        ? {
            folder: comingBackTo(handle),
            keepInIt: () => changeLog.returnToFolder(browserFolder(handle)),
            choose,
          }
        : undefined,
    unread:
      handle && !hasBudget
        ? {
            folder: comingBackTo(handle),
            handle,
            readFolder,
            underway: changeLog.fullReadUnderway,
            choose,
            showTwoBudgets: chooser.showTwoBudgets,
          }
        : undefined,
    checkFolder: changeLog.checkFolder,
  };
}
