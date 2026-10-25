import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createChangeLogWriter, thisDeviceId } from "./kernel/change-log";
import { openIndexedDbChangeLog } from "./kernel/indexed-db-change-log";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

// Every record is read from browser storage before the first render, so a
// returning user opens straight into their Budget.
const writer = createChangeLogWriter(
  await openIndexedDbChangeLog(),
  thisDeviceId(),
);

createRoot(root).render(
  <StrictMode>
    <App writer={writer} />
  </StrictMode>,
);
