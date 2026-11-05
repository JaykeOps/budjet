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
} from "./kernel/indexed-db-change-log";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

// Every record is read from browser storage before the first render, so a
// returning user opens straight into their Budget.
const [{ changeLog, keepInFolder }, deviceId] = await Promise.all([
  hasFolderPicker()
    ? openFolderStorage()
    : { changeLog: await openIndexedDbChangeLog(), keepInFolder: undefined },
  openIndexedDbDeviceId(),
]);
const writer = createChangeLogWriter(changeLog, deviceId);

createRoot(root).render(
  <StrictMode>
    <App writer={writer} keepInFolder={keepInFolder} />
  </StrictMode>,
);

async function openFolderStorage() {
  const handle = await rememberedFolderHandle();
  const changeLog = await openDataFolderChangeLog({
    folder: handle && browserFolder(handle),
  });
  return {
    changeLog,
    keepInFolder: async (chosen: FileSystemDirectoryHandle) => {
      await rememberFolderHandle(chosen);
      changeLog.keepInFolder(browserFolder(chosen));
    },
  };
}
