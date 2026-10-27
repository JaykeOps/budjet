import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createChangeLogWriter } from "./kernel/change-log";
import {
  openIndexedDbChangeLog,
  openIndexedDbDeviceId,
} from "./kernel/indexed-db-change-log";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

// PROTOTYPE (prototype/navigation): `?variant=` opens the navigation
// prototype over an in-memory demo Budget instead of the saved one.
if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("variant")
) {
  const [{ NavigationPrototype }, { demoWriter }] = await Promise.all([
    import("./navigation-prototype/NavigationPrototype"),
    import("./navigation-prototype/demo-data"),
  ]);
  createRoot(root).render(<NavigationPrototype writer={demoWriter()} />);
} else {
  // Every record is read from browser storage before the first render, so a
  // returning user opens straight into their Budget.
  const [changeLog, deviceId] = await Promise.all([
    openIndexedDbChangeLog(),
    openIndexedDbDeviceId(),
  ]);
  const writer = createChangeLogWriter(changeLog, deviceId);

  createRoot(root).render(
    <StrictMode>
      <App writer={writer} />
    </StrictMode>,
  );
}
