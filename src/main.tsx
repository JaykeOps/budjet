import "./ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./install-offer";
import { hasFolderPicker } from "./first-run/browser";
import { GettingYourBudget } from "./first-run/FirstRun";
import { browserFolder, returningFolder } from "./kernel/browser-folder";
import { createChangeLogWriter } from "./kernel/change-log";
import {
  type FullReadProgress,
  openDataFolderChangeLog,
} from "./kernel/data-folder-change-log";
import { scheduleFolderChecks } from "./kernel/folder-checks";
import { tryFolderOnReturn } from "./kernel/folder-on-return";
import {
  openIndexedDbChangeLog,
  openIndexedDbDeviceId,
  rememberedFolderHandle,
  rememberFolderHandle,
  upgradeDatabase,
} from "./kernel/indexed-db-change-log";
import { ReturnToFolder } from "./ReturnToFolder";
import { budget } from "./slices/budget-setup";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

// Rendering replaces this message, if it ever had to show.
await upgradeDatabase({
  onBlocked() {
    root.innerHTML =
      '<p role="alert">Close Crownkeep\'s other tabs to finish updating.</p>';
  },
});

// Every record is read from browser storage before the first render, so a
// returning user opens straight into their Budget.
const [{ changeLog, keepInFolder, returning, unread, checkFolder }, deviceId] =
  await Promise.all([
    hasFolderPicker()
      ? openFolderStorage()
      : {
          changeLog: await openIndexedDbChangeLog(),
          keepInFolder: undefined,
          returning: undefined,
          unread: undefined,
          checkFolder: undefined,
        },
    openIndexedDbDeviceId(),
  ]);
const writer = createChangeLogWriter(changeLog, deviceId);
const reactRoot = createRoot(root);

function showApp() {
  reactRoot.render(
    <StrictMode>
      <App writer={writer} keepInFolder={keepInFolder} />
    </StrictMode>,
  );
  // Only now: a returning user is back in their folder by the time the app shows.
  if (checkFolder) scheduleFolderChecks(checkFolder);
}

if (returning) {
  const { folder, keepInIt, keepInChosen } = returning;
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
          onChoose={async (chosen) => {
            await keepInChosen(chosen);
            showApp();
          }}
        />
      </StrictMode>,
    );
  }
} else if (unread) {
  const { folder, handle, readFolder, underway, keepInChosen } = unread;
  const openFrom = async (from: FileSystemDirectoryHandle) => {
    await readFolder(from, (progress) =>
      reactRoot.render(
        <StrictMode>
          <GettingYourBudget progress={progress} />
        </StrictMode>,
      ),
    ).catch((error) =>
      // Back to first run, where choosing the folder again picks up from here.
      console.error("Crownkeep could not read the folder", error),
    );
    showApp();
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
          onChoose={async (chosen) => {
            await keepInChosen(chosen);
            await openFrom(chosen);
          }}
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
  const changeLog = await openDataFolderChangeLog();
  const readFolder = (
    chosen: FileSystemDirectoryHandle,
    onProgress: (progress: FullReadProgress) => void,
  ) =>
    changeLog.readFolderInFull(browserFolder(chosen), {
      holdsBudget: (records) => budget(records) !== undefined,
      onProgress,
    });
  const rememberChosen = async (chosen: FileSystemDirectoryHandle) => {
    const remembered = await rememberedFolderHandle();
    if (!(await remembered?.isSameEntry(chosen))) {
      await changeLog.forgetFullRead();
    }
    await rememberFolderHandle(chosen);
  };
  const keepInFolder = async (
    chosen: FileSystemDirectoryHandle,
    onProgress: (progress: FullReadProgress) => void,
  ) => {
    await rememberChosen(chosen);
    if (!(await readFolder(chosen, onProgress))) {
      changeLog.keepInFolder(browserFolder(chosen));
    }
  };
  const handle = await rememberedFolderHandle();
  const hasBudget = budget(changeLog.readAll()) !== undefined;
  return {
    changeLog,
    keepInFolder,
    returning:
      handle && hasBudget
        ? {
            folder: returningFolder(handle),
            keepInIt: () => changeLog.returnToFolder(browserFolder(handle)),
            keepInChosen: async (chosen: FileSystemDirectoryHandle) => {
              await rememberFolderHandle(chosen);
              changeLog.keepInFolder(browserFolder(chosen));
            },
          }
        : undefined,
    unread:
      handle && !hasBudget
        ? {
            folder: returningFolder(handle),
            handle,
            readFolder,
            underway: changeLog.fullReadUnderway,
            keepInChosen: rememberChosen,
          }
        : undefined,
    checkFolder: changeLog.checkFolder,
  };
}
