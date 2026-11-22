import { describe, expect, it } from "vitest";
import {
  type ChangeRecord,
  createDeviceChangeLog,
  createInMemoryChangeLog,
  deletedSubjects,
  latestBySubject,
  perSnapshot,
} from "./change-log";
import { seedRecord } from "./seed-record";

describe("perSnapshot", () => {
  it("replays each Change Log snapshot once, and again after an append", () => {
    const log = createInMemoryChangeLog();
    let replays = 0;
    const count = perSnapshot((records) => {
      replays += 1;
      return records.length;
    });
    expect(count(log.readAll())).toBe(0);
    expect(count(log.readAll())).toBe(0);
    expect(replays).toBe(1);
    seedRecord(createDeviceChangeLog(log, "device"), "thing", "Named", {});
    expect(count(log.readAll())).toBe(1);
    expect(replays).toBe(2);
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
    const phone = createDeviceChangeLog(
      createInMemoryChangeLog(),
      "phone",
      clock,
    );
    const first = seedRecord(phone, "thing", "Named", { name: "first" });
    clock.set(2_000);
    const second = seedRecord(phone, "thing", "Named", { name: "second" });

    const log = createInMemoryChangeLog();
    log.append([second]);
    log.append([first]);

    expect(log.readAll()).toEqual([first, second]);
  });

  it("notifies subscribers on append until they unsubscribe", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");
    let notifications = 0;
    const unsubscribe = log.subscribe(() => {
      notifications++;
    });

    seedRecord(phone, "thing", "Named", { name: "first" });
    unsubscribe();
    seedRecord(phone, "thing", "Named", { name: "second" });

    expect(notifications).toBe(1);
  });

  describe("when two records change the same thing, the later one wins", () => {
    it("whatever order they arrive in, even with skewed device clocks", () => {
      // The laptop's clock runs an hour fast.
      const laptopClock = fakeClock(10 * HOUR);
      const laptopLog = createInMemoryChangeLog();
      const laptop = createDeviceChangeLog(laptopLog, "laptop", laptopClock);
      const earlier = seedRecord(laptop, "thing", "Named", {
        name: "from laptop",
      });

      // Five minutes later the phone has synced the laptop's edit, then edits.
      const phoneLog = createInMemoryChangeLog();
      phoneLog.append([earlier]);
      const phone = createDeviceChangeLog(
        phoneLog,
        "phone",
        fakeClock(9 * HOUR + 5 * MINUTE),
      );
      const later = seedRecord(phone, "thing", "Named", { name: "from phone" });

      expect(nameAfterMerging(earlier, later)).toBe("from phone");
      expect(nameAfterMerging(later, earlier)).toBe("from phone");
    });

    it("with the device id breaking a tie", () => {
      const sameTime = { now: () => 1_000 };
      const apple = createDeviceChangeLog(
        createInMemoryChangeLog(),
        "device-a",
        sameTime,
      );
      const banana = createDeviceChangeLog(
        createInMemoryChangeLog(),
        "device-b",
        sameTime,
      );
      const fromA = seedRecord(apple, "thing", "Named", { name: "from a" });
      const fromB = seedRecord(banana, "thing", "Named", { name: "from b" });

      expect(nameAfterMerging(fromA, fromB)).toBe("from b");
      expect(nameAfterMerging(fromB, fromA)).toBe("from b");
    });

    it("keeping each thing's own latest record", () => {
      const log = createInMemoryChangeLog();
      const phone = createDeviceChangeLog(log, "phone");
      seedRecord(phone, "rent", "Named", { name: "Rent" });
      const power = seedRecord(phone, "power", "Named", { name: "Power" });
      const rent = seedRecord(phone, "rent", "Named", { name: "Housing" });

      expect(latestBySubject(log.readAll())).toEqual(
        new Map([
          ["power", power],
          ["rent", rent],
        ]),
      );
    });
  });
});

describe("deletedSubjects", () => {
  it("names every subject with a delete record, wherever it falls among the rest", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");
    seedRecord(phone, "kept", "Named", { name: "Rent" });
    seedRecord(phone, "gone", "Named", { name: "Power" });
    seedRecord(phone, "gone", "Deleted", {});
    seedRecord(phone, "gone", "Named", { name: "Water" });

    expect(
      deletedSubjects(log.readAll(), ({ type }) => type === "Deleted"),
    ).toEqual(new Set(["gone"]));
  });
});

describe("writing at an earlier record's place", () => {
  it("sorts the new record where that record is, not last, and keeps the clock moving forward", () => {
    const log = createInMemoryChangeLog();
    let clock = 1_000;
    const phone = createDeviceChangeLog(log, "phone", { now: () => clock++ });
    const earlier = seedRecord(phone, "thing", "Named", { name: "a" });
    const next = seedRecord(phone, "thing", "Named", { name: "b" });

    const placed = phone
      .writeAt(earlier.timestamp, "thing", "Named")
      .ensure(() => undefined)
      .commit(() => ({ name: "c" }));
    const after = seedRecord(phone, "thing", "Named", { name: "d" });

    expect(placed.id).not.toBe(earlier.id);
    expect(placed.timestamp).toEqual(earlier.timestamp);
    expect(placed.writtenAt).toBe(1_002);
    expect(log.readAll().map(({ id }) => id)).toEqual([
      ...[earlier.id, placed.id].sort(),
      next.id,
      after.id,
    ]);
    expect(after.timestamp.wallTime).toBe(1_003);
  });
});

describe("writing through a check", () => {
  it("writes nothing when the check refuses, and says why", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");
    let built = false;

    expect(() =>
      phone
        .write("thing", "Named")
        .ensure(() => {
          throw new RangeError("No such thing");
        })
        .commit(() => {
          built = true;
          return { name: "never" };
        }),
    ).toThrow("No such thing");
    expect(built).toBe(false);
    expect(log.readAll()).toEqual([]);
  });

  it("writes nothing when the payload can't be built", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");

    expect(() =>
      phone
        .write("thing", "Named")
        .ensure(() => undefined)
        .commit(() => {
          throw new RangeError("A name can't be blank");
        }),
    ).toThrow("A name can't be blank");
    expect(log.readAll()).toEqual([]);
  });

  it("checks the records as they stand at commit, and builds the payload from what it found", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");
    const counting = phone
      .write("tally", "Counted")
      .ensure((records) => records.length);
    expect(log.readAll()).toEqual([]);

    seedRecord(phone, "thing", "Named", { name: "first" });
    const tally = counting.commit((count) => ({ count }));

    expect(tally.payload).toEqual({ count: 1 });
    expect(log.readAll()).toEqual([expect.anything(), tally]);
  });

  it("writes many records from one check, each stamped after the last, in one append", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone", { now: () => 1_000 });
    let appends = 0;
    log.subscribe(() => {
      appends++;
    });

    const written = phone
      .writeMany()
      .ensure(() => ["a", "b", "c"])
      .commit((names) =>
        names.map((name) => ({
          subjectId: name,
          type: "Named",
          payload: { name },
        })),
      );

    expect(appends).toBe(1);
    expect(log.readAll()).toEqual(written);
    expect(written.map(({ timestamp }) => timestamp)).toEqual([
      { wallTime: 1_000, counter: 0 },
      { wallTime: 1_000, counter: 1 },
      { wallTime: 1_000, counter: 2 },
    ]);
  });

  it("writes and tells no one when there is nothing to write", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");
    let appends = 0;
    log.subscribe(() => {
      appends++;
    });

    const written = phone
      .writeMany()
      .ensure(() => undefined)
      .commit(() => []);

    expect(written).toEqual([]);
    expect(appends).toBe(0);
  });

  it("writes none of many records when the check refuses", () => {
    const log = createInMemoryChangeLog();
    const phone = createDeviceChangeLog(log, "phone");

    expect(() =>
      phone
        .writeMany()
        .ensure(() => {
          throw new Error("refused");
        })
        .commit(() => [{ subjectId: "a", type: "Named", payload: {} }]),
    ).toThrow("refused");
    expect(log.readAll()).toEqual([]);
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
