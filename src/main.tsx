import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createInMemoryChangeLog, createWriter } from "./kernel/change-log";
import { thisDeviceId } from "./slices/budget-setup";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

// In memory only for now: the Budget is lost on reload until it is saved to the browser.
const writer = createWriter(createInMemoryChangeLog(), thisDeviceId());

createRoot(root).render(
  <StrictMode>
    <App writer={writer} />
  </StrictMode>,
);
