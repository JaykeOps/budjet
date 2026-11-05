import "./ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hasFolderPicker } from "./first-run/browser";
import { browserFolder } from "./kernel/browser-folder";
import { createChangeLogWriter } from "./kernel/change-log";
import { openDataFolderChangeLog } from "./kernel/data-folder-change-log";
import {
  openIndexedDbChangeLog,
  openIndexedDbDeviceId,
  rememberedFolderHandle,
  rememberFolderHandle,
  upgradeDatabase,
} from "./kernel/indexed-db-change-log";

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
const [{ changeLog, ...folderActions }, deviceId] = await Promise.all([
  hasFolderPicker()
    ? openFolderStorage()
    : {
        changeLog: await openIndexedDbChangeLog(),
        keepInFolder: undefined,
        folderOffer: undefined,
      },
  openIndexedDbDeviceId(),
]);
const writer = createChangeLogWriter(changeLog, deviceId);

createRoot(root).render(
  <StrictMode>
    <App writer={writer} {...folderActions} />
  </StrictMode>,
);

async function openFolderStorage() {
  const handle = await rememberedFolderHandle();
  const changeLog = await openDataFolderChangeLog({
    folder: handle && browserFolder(handle),
  });
  // A tab still on browser storage would keep writing only there, so it starts over.
  const moved = new BroadcastChannel("crownkeep-moved-into-folder");
  moved.onmessage = () => location.reload();
  return {
    changeLog,
    keepInFolder: async (chosen: FileSystemDirectoryHandle) => {
      await rememberFolderHandle(chosen);
      changeLog.keepInFolder(browserFolder(chosen));
    },
    folderOffer: {
      isInFolder: changeLog.inFolder,
      moveIntoFolder: async (chosen: FileSystemDirectoryHandle) => {
        const outcome = await changeLog.moveIntoFolder(
          browserFolder(chosen),
          chosen,
        );
        if (outcome === "moved") moved.postMessage(null);
        return outcome;
      },
    },
  };
}
