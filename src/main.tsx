import "./ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./install-offer";
import { hasFolderPicker } from "./first-run/browser";
import { browserFolder, returningFolder } from "./kernel/browser-folder";
import { createChangeLogWriter } from "./kernel/change-log";
import { openDataFolderChangeLog } from "./kernel/data-folder-change-log";
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
const [{ changeLog, keepInFolder, returning, checkFolder }, deviceId] =
  await Promise.all([
    hasFolderPicker()
      ? openFolderStorage()
      : {
          changeLog: await openIndexedDbChangeLog(),
          keepInFolder: undefined,
          returning: undefined,
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
} else {
  showApp();
}

/**
 * Opens without its folder, so nothing writes there until the user is back in
 * it. A remembered folder with no Budget is first run, which asks again.
 */
async function openFolderStorage() {
  const changeLog = await openDataFolderChangeLog();
  const keepInFolder = async (chosen: FileSystemDirectoryHandle) => {
    await rememberFolderHandle(chosen);
    changeLog.keepInFolder(browserFolder(chosen));
  };
  const handle = await rememberedFolderHandle();
  const returning =
    handle && budget(changeLog.readAll())
      ? {
          folder: returningFolder(handle),
          keepInIt: () => changeLog.returnToFolder(browserFolder(handle)),
          keepInChosen: keepInFolder,
        }
      : undefined;
  return {
    changeLog,
    keepInFolder,
    returning,
    checkFolder: changeLog.checkFolder,
  };
}
