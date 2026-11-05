import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CheckScope, scheduleFolderChecks } from "./folder-checks";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

function aSchedule({ visible = true, finishesFull = true } = {}) {
  const checks: CheckScope[] = [];
  const page = {
    visible,
    regainFocus: () => {},
    isVisible: () => page.visible,
    onRegainedFocus(listener: () => void) {
      page.regainFocus = listener;
    },
  };
  scheduleFolderChecks(async (scope) => {
    checks.push(scope);
    return finishesFull;
  }, page);
  return { checks, page };
}

const pass = (time: number) => vi.advanceTimersByTimeAsync(time);

describe("when the Data Folder is checked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a full check once per open", async () => {
    const { checks, page } = aSchedule();
    await pass(11 * MINUTE);
    page.regainFocus();
    await pass(0);

    expect(checks.filter((scope) => scope === "full")).toHaveLength(1);
    expect(checks[0]).toBe("full");
  });

  it("runs a quick check every 5 minutes while visible", async () => {
    const { checks } = aSchedule();
    await pass(0);
    expect(checks).toEqual(["full"]);

    await pass(5 * MINUTE - 1);
    expect(checks).toEqual(["full"]);
    await pass(1);
    expect(checks).toEqual(["full", "quick"]);
    await pass(5 * MINUTE);
    expect(checks).toEqual(["full", "quick", "quick"]);
  });

  it("runs a quick check on regaining focus, at most once every 30 seconds", async () => {
    const { checks, page } = aSchedule();
    await pass(30 * SECOND);

    page.regainFocus();
    await pass(29 * SECOND);
    page.regainFocus();
    expect(checks).toEqual(["full", "quick"]);

    await pass(SECOND);
    page.regainFocus();
    expect(checks).toEqual(["full", "quick", "quick"]);
  });

  it("runs nothing while hidden, not even the full check", async () => {
    const { checks, page } = aSchedule({ visible: false });
    await pass(11 * MINUTE);
    expect(checks).toEqual([]);

    page.visible = true;
    page.regainFocus();
    expect(checks).toEqual(["full"]);

    page.visible = false;
    await pass(11 * MINUTE);
    expect(checks).toEqual(["full"]);
  });

  it("tells a running check to stop once the page is hidden", async () => {
    const seen: boolean[] = [];
    const page = {
      visible: true,
      isVisible: () => page.visible,
      onRegainedFocus: () => {},
    };
    scheduleFolderChecks(async (_scope, keepGoing) => {
      seen.push(keepGoing());
      page.visible = false;
      seen.push(keepGoing());
      return false;
    }, page);
    await pass(0);

    expect(seen).toEqual([true, false]);
  });

  it("goes on trying the full check until one gets through the folder", async () => {
    const { checks } = aSchedule({ finishesFull: false });
    await pass(5 * MINUTE);

    expect(checks).toEqual(["full", "full"]);
  });

  it("doesn't start a check while one is running", async () => {
    const checks: CheckScope[] = [];
    const running = new Promise<boolean>(() => {});
    scheduleFolderChecks(
      (scope) => {
        checks.push(scope);
        return running;
      },
      { isVisible: () => true, onRegainedFocus: () => {} },
    );
    await pass(11 * MINUTE);

    expect(checks).toEqual(["full"]);
  });
});
