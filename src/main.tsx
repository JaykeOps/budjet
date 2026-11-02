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

// PROTOTYPE (prototype/visual-language): `?variant=` opens the visual
// language prototype instead of the saved Budget.
// PROTOTYPE (prototype/budget-screen): `?budget=` opens the Budget screen
// prototype.
// PROTOTYPE (prototype/record-transaction): `?record=` opens the recording
// prototype.
// PROTOTYPE (prototype/assign): `?assign=` opens the assigning prototype.
// PROTOTYPE (prototype/accounts): `?accounts=` opens the Account screens
// prototype.
// PROTOTYPE (prototype/first-run): `?first=` opens the first run prototype.
if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("first")
) {
  const { FirstRunPrototype } = await import(
    "./first-run-prototype/FirstRunPrototype"
  );
  createRoot(root).render(<FirstRunPrototype />);
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("accounts")
) {
  const { AccountsPrototype } = await import(
    "./accounts-prototype/AccountsPrototype"
  );
  createRoot(root).render(<AccountsPrototype />);
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("assign")
) {
  const { AssignPrototype } = await import(
    "./assign-prototype/AssignPrototype"
  );
  createRoot(root).render(<AssignPrototype />);
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("record")
) {
  const { RecordPrototype } = await import(
    "./record-prototype/RecordPrototype"
  );
  createRoot(root).render(<RecordPrototype />);
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("budget")
) {
  const { BudgetScreenPrototype } = await import(
    "./budget-screen-prototype/BudgetScreenPrototype"
  );
  createRoot(root).render(<BudgetScreenPrototype />);
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("variant")
) {
  const { VisualLanguagePrototype } = await import(
    "./visual-language-prototype/VisualLanguagePrototype"
  );
  createRoot(root).render(<VisualLanguagePrototype />);
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
