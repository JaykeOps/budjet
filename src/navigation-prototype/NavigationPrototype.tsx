// PROTOTYPE (prototype/navigation): throwaway. Three navigation variants on
// the app's own route, switchable via `?variant=`, over an in-memory Budget.
// `?frame=phone` squeezes any of them into a phone-sized frame.
import { useEffect } from "react";
import type { ChangeLogWriter } from "../kernel/change-log";
import { ChangeLogWriterProvider } from "../kernel/use-change-log-query";
import { useUrlParameter } from "../url-parameter";
import "./prototype.css";
import { AccountsHub, BudgetOnly, TabBar } from "./variants";

const variants = {
  A: ["Tab bar + (+)", TabBar],
  B: ["Budget | Accounts hub", AccountsHub],
  C: ["Budget only, sheets", BudgetOnly],
} as const;
type Key = keyof typeof variants;
const keys = Object.keys(variants) as Key[];

export function NavigationPrototype({ writer }: { writer: ChangeLogWriter }) {
  const [variant, setVariant] = useUrlParameter("variant");
  const [frame, setFrame] = useUrlParameter("frame");
  const key: Key = keys.includes(variant as Key) ? (variant as Key) : "A";
  const [name, Variant] = variants[key];

  function cycle(by: number) {
    const next = keys[(keys.indexOf(key) + by + keys.length) % keys.length];
    // Each variant keeps its own place in the URL, so start the next one clean.
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("variant", next);
    if (frame) url.searchParams.set("frame", frame);
    window.history.replaceState(null, "", url);
    setVariant(next, "replace");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <ChangeLogWriterProvider value={writer}>
      <div
        className="p-stage"
        data-frame={frame === "phone" ? "phone" : "full"}
      >
        <div className="p-app">
          <Variant key={key} />
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className="p-switcher" aria-label="Prototype switcher">
          <button
            type="button"
            onClick={() => cycle(-1)}
            aria-label="Previous variant"
          >
            ←
          </button>
          <span>
            {key} ({name})
          </span>
          <button
            type="button"
            onClick={() => cycle(1)}
            aria-label="Next variant"
          >
            →
          </button>
          <button
            type="button"
            onClick={() =>
              setFrame(frame === "phone" ? "full" : "phone", "replace")
            }
          >
            {frame === "phone" ? "Full width" : "Phone frame"}
          </button>
        </div>
      )}
    </ChangeLogWriterProvider>
  );
}
