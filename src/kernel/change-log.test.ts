import { describe, expect, it } from "vitest";
import {
  type ChangeRecord,
  createChangeLogWriter,
  createInMemoryChangeLog,
  latestBySubject,
  perSnapshot,
} from "./change-log";

describe("perSnapshot", () => {
  it("folds each Change Log snapshot once, and again after an append", () => {
    const log = createInMemoryChangeLog();
    let folds = 0;
    const count = perSnapshot((records) => {
      folds += 1;
      return records.length;
    });
    expect(count(log.readAll())).toBe(0);
    expect(count(log.readAll())).toBe(0);
    expect(folds).toBe(1);
    createChangeLogWriter(log, "device").write("thing", "Named", {});
    expect(count(log.readAll())).toBe(1);
    expect(folds).toBe(2);
  });
});

/** A clock that reads whatever time the test last set. */
function fakeClock(start: number) {
  let time = start;
  return {
    now: () => time,
    set: (next: number) => {
      time = next;
    },
  };
}

describe("Change Log", () => {
  it("returns records in timestamp order, whatever order they were appended in", () => {
    const clock = fakeClock(1_000);
    const phone = createChangeLogWriter(
      createInMemoryChangeLog(),
      "phone",
      clock,
    );
    const first = phone.write("thing", "Named", { name: "first" });
    clock.set(2_000);
    const second = phone.write("thing", "Named", { name: "second" });

    const log = createInMemoryChangeLog();
    log.append([second]);
    log.append([first]);

    expect(log.readAll()).toEqual([first, second]);
  });

  it("notifies subscribers on append until they unsubscribe", () => {
    const log = createInMemoryChangeLog();
    const phone = createChangeLogWriter(log, "phone");
    let notifications = 0;
    const unsubscribe = log.subscribe(() => {
      notifications++;
    });

    phone.write("thing", "Named", { name: "first" });
    unsubscribe();
    phone.write("thing", "Named", { name: "second" });

    expect(notifications).toBe(1);
  });

  describe("when two records change the same thing, the later one wins", () => {
    it("whatever order they arrive in, even with skewed device clocks", () => {
      // The laptop's clock runs an hour fast.
      const laptopClock = fakeClock(10 * HOUR);
      const laptopLog = createInMemoryChangeLog();
      const laptop = createChangeLogWriter(laptopLog, "laptop", laptopClock);
      const earlier = laptop.write("thing", "Named", { name: "from laptop" });

      // Five minutes later the phone has synced the laptop's edit, then edits.
      const phoneLog = createInMemoryChangeLog();
      phoneLog.append([earlier]);
      const phone = createChangeLogWriter(
        phoneLog,
        "phone",
        fakeClock(9 * HOUR + 5 * MINUTE),
      );
      const later = phone.write("thing", "Named", { name: "from phone" });

      expect(nameAfterMerging(earlier, later)).toBe("from phone");
      expect(nameAfterMerging(later, earlier)).toBe("from phone");
    });

    it("with the device id breaking a tie", () => {
      const sameTime = { now: () => 1_000 };
      const apple = createChangeLogWriter(
        createInMemoryChangeLog(),
        "device-a",
        sameTime,
      );
      const banana = createChangeLogWriter(
        createInMemoryChangeLog(),
        "device-b",
        sameTime,
      );
      const fromA = apple.write("thing", "Named", { name: "from a" });
      const fromB = banana.write("thing", "Named", { name: "from b" });

      expect(nameAfterMerging(fromA, fromB)).toBe("from b");
      expect(nameAfterMerging(fromB, fromA)).toBe("from b");
    });

    it("keeping each thing's own latest record", () => {
      const log = createInMemoryChangeLog();
      const phone = createChangeLogWriter(log, "phone");
      phone.write("rent", "Named", { name: "Rent" });
      const power = phone.write("power", "Named", { name: "Power" });
      const rent = phone.write("rent", "Named", { name: "Housing" });

      expect(latestBySubject(log.readAll())).toEqual(
        new Map([
          ["power", power],
          ["rent", rent],
        ]),
      );
    });
  });
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Appends the records one by one to a fresh log and reads the thing's latest name. */
function nameAfterMerging(
  ...records: ChangeRecord<string, { name: string }>[]
) {
  const log = createInMemoryChangeLog();
  for (const record of records) log.append([record]);
  const latest = latestBySubject(log.readAll()).get("thing");
  return (latest as (typeof records)[number] | undefined)?.payload.name;
}
