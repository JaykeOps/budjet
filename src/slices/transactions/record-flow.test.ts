import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { AccountOpened } from "../accounts/records";
import type { AssignmentSet } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  CategoryCreated,
  CategoryGroupCreated,
} from "../categories/records";
import { recordTransaction } from "./commands";
import { knownPayees } from "./queries";
import {
  categoryChoices,
  type Draft,
  dayBefore,
  draftAmount,
  draftOf,
  matchingPayees,
  withDirection,
  withPayee,
} from "./record-flow";

/** A USD Budget with Accounts "checking" and "savings", and Categories "groceries" and "dining". */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  for (const id of ["checking", "savings"]) {
    writer.write<AccountOpened["type"], AccountOpened["payload"]>(
      id,
      "AccountOpened",
      {
        version: 1,
        name: id,
        kind: "checking",
        openingBalance: money(100000, "USD"),
      },
    );
  }
  writer.write<CategoryGroupCreated["type"], CategoryGroupCreated["payload"]>(
    "everyday",
    "CategoryGroupCreated",
    { version: 1, name: "Everyday", position: 0 },
  );
  for (const [position, id] of ["groceries", "dining"].entries()) {
    writer.write<CategoryCreated["type"], CategoryCreated["payload"]>(
      id,
      "CategoryCreated",
      { version: 1, name: id, groupId: "everyday", position },
    );
  }
  return { writer, records: () => changeLog.readAll() };
}

const spend = {
  date: "2026-10-12",
  amount: money(-1850, "USD"),
};

const draft: Draft = {
  direction: "out",
  typed: "18.50",
  payee: "",
  date: "2026-10-15",
  accountId: "checking",
};

describe("knownPayees", () => {
  it("remembers each Payee's last Category and Account", () => {
    const { writer, records } = budget();
    recordTransaction(writer, {
      ...spend,
      accountId: "checking",
      categoryId: "groceries",
      payee: "Corner Bistro",
    });
    recordTransaction(writer, {
      ...spend,
      accountId: "savings",
      categoryId: "dining",
      payee: "Corner Bistro",
    });

    expect(knownPayees(records())).toEqual([
      { name: "Corner Bistro", categoryId: "dining", accountId: "savings" },
    ]);
  });

  it("keeps the last Category when money later came in to Ready to Assign", () => {
    const { writer, records } = budget();
    recordTransaction(writer, {
      ...spend,
      accountId: "checking",
      categoryId: "groceries",
      payee: "Corner Bistro",
    });
    recordTransaction(writer, {
      ...spend,
      amount: money(500, "USD"),
      accountId: "checking",
      payee: "Corner Bistro",
    });

    expect(knownPayees(records())[0]?.categoryId).toBe("groceries");
  });

  it("forgets a Category that's hidden and an Account that's closed", () => {
    const { writer, records } = budget();
    recordTransaction(writer, {
      ...spend,
      accountId: "savings",
      categoryId: "dining",
      payee: "Corner Bistro",
    });
    writer.write("dining", "CategoryHidden", { version: 1 });
    writer.write("savings", "AccountClosed", { version: 1 });

    expect(knownPayees(records())).toEqual([{ name: "Corner Bistro" }]);
  });
});

describe("withPayee", () => {
  const known = [
    { name: "Corner Bistro", categoryId: "dining", accountId: "savings" },
  ];

  it("fills in a known Payee's Category and Account when no Category is chosen", () => {
    expect(withPayee(draft, "Corner Bistro", known)).toEqual({
      ...draft,
      payee: "Corner Bistro",
      categoryId: "dining",
      accountId: "savings",
    });
  });

  it("keeps a Category that's chosen, and still fills in the Account", () => {
    expect(
      withPayee({ ...draft, categoryId: "groceries" }, "Corner Bistro", known),
    ).toEqual({
      ...draft,
      payee: "Corner Bistro",
      categoryId: "groceries",
      accountId: "savings",
    });
  });

  it("treats Ready to Assign as chosen for money coming in", () => {
    expect(
      withPayee({ ...draft, direction: "in" }, "Corner Bistro", known)
        .categoryId,
    ).toBeUndefined();
  });

  it("matches a whole name whatever its case, and nothing less", () => {
    expect(withPayee(draft, "corner bistro ", known).accountId).toBe("savings");
    expect(withPayee(draft, "Corner", known)).toEqual({
      ...draft,
      payee: "Corner",
    });
  });

  it("leaves the Account when the Payee's last one is closed", () => {
    expect(withPayee(draft, "Old Shop", [{ name: "Old Shop" }]).accountId).toBe(
      "checking",
    );
  });
});

describe("matchingPayees", () => {
  const known = [
    { name: "Corner Bistro" },
    { name: "Corner Shop" },
    { name: "Bakery" },
  ];

  it("suggests names starting with what's typed", () => {
    expect(matchingPayees("cor", known).map(({ name }) => name)).toEqual([
      "Corner Bistro",
      "Corner Shop",
    ]);
  });

  it("suggests nothing before typing or once the whole name is typed", () => {
    expect(matchingPayees("", known)).toEqual([]);
    expect(matchingPayees("bakery", known)).toEqual([]);
  });
});

describe("draftAmount", () => {
  it.each([
    ["18.50", "out", -1850],
    ["18,5", "in", 1850],
  ] as const)("reads %s %s as %i", (typed, direction, minorUnits) => {
    expect(draftAmount({ ...draft, typed, direction }, "USD")).toEqual(
      money(minorUnits, "USD"),
    );
  });

  it.each(["", "0", "0.00", ".", "1.234", "abc"])(
    "has no amount for %j",
    (typed) => {
      expect(draftAmount({ ...draft, typed }, "USD")).toBeUndefined();
    },
  );
});

describe("withDirection", () => {
  it("clears the Category when the direction changes, as money in starts at Ready to Assign", () => {
    expect(withDirection({ ...draft, categoryId: "groceries" }, "in")).toEqual({
      ...draft,
      direction: "in",
    });
  });

  it("keeps the Category when the direction stays", () => {
    expect(
      withDirection({ ...draft, categoryId: "groceries" }, "out").categoryId,
    ).toBe("groceries");
  });
});

describe("categoryChoices", () => {
  it("lists Available in the Month by Group, and Ready to Assign, leaving hidden Categories out", () => {
    const { writer, records } = budget();
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      "groceries-2026-10",
      "AssignmentSet",
      {
        version: 1,
        categoryId: "groceries",
        month: "2026-10",
        amount: money(5000, "USD"),
      },
    );
    recordTransaction(writer, {
      ...spend,
      accountId: "checking",
      categoryId: "groceries",
    });
    writer.write("dining", "CategoryHidden", { version: 1 });

    expect(categoryChoices(records(), "2026-10", "USD")).toEqual({
      readyToAssign: money(195000, "USD"),
      groups: [
        {
          id: "everyday",
          name: "Everyday",
          categories: [
            {
              id: "groceries",
              name: "groceries",
              available: money(3150, "USD"),
            },
          ],
        },
      ],
    });
  });

  it("leaves out a Group with nothing to choose", () => {
    const { writer, records } = budget();
    writer.write("groceries", "CategoryHidden", { version: 1 });
    writer.write("dining", "CategoryHidden", { version: 1 });

    expect(categoryChoices(records(), "2026-10", "USD").groups).toEqual([]);
  });
});

describe("categoryChoices while editing a Transaction", () => {
  const lunch = {
    id: "lunch",
    accountId: "checking",
    date: "2026-10-12",
    amount: money(-1850, "USD"),
    categoryId: "groceries",
  };
  const availableIn = (
    choices: ReturnType<typeof categoryChoices>,
    id: string,
  ) =>
    choices.groups
      .flatMap(({ categories }) => categories)
      .find((category) => category.id === id)?.available;

  it("leaves that Transaction's money out of its Category, in its Month and later ones", () => {
    const { writer, records } = budget();
    recordTransaction(writer, lunch);

    for (const month of ["2026-10", "2026-11"] as const) {
      expect(
        availableIn(
          categoryChoices(records(), month, "USD", lunch),
          "groceries",
        ),
      ).toEqual(money(0, "USD"));
    }
    expect(
      availableIn(
        categoryChoices(records(), "2026-09", "USD", lunch),
        "groceries",
      ),
    ).toEqual(money(0, "USD"));
    expect(
      availableIn(categoryChoices(records(), "2026-10", "USD"), "groceries"),
    ).toEqual(money(-1850, "USD"));
  });

  it("leaves money that came in to Ready to Assign out of Ready to Assign", () => {
    const { writer, records } = budget();
    const paycheck = {
      id: "paycheck",
      accountId: "checking",
      date: "2026-10-12",
      amount: money(5000, "USD"),
    };
    recordTransaction(writer, paycheck);

    expect(
      categoryChoices(records(), "2026-10", "USD", paycheck).readyToAssign,
    ).toEqual(money(200000, "USD"));
  });

  it("still offers its Category if that has since been hidden", () => {
    const { writer, records } = budget();
    recordTransaction(writer, lunch);
    writer.write("groceries", "CategoryHidden", { version: 1 });

    expect(
      categoryChoices(
        records(),
        "2026-10",
        "USD",
        lunch,
      ).groups[0]?.categories.map(({ id }) => id),
    ).toEqual(["groceries", "dining"]);
  });
});

describe("draftOf", () => {
  it("starts from what the Transaction says, keeping the memo the phone doesn't show", () => {
    expect(
      draftOf({
        id: "lunch",
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-1850, "USD"),
        categoryId: "groceries",
        payee: "Corner Bistro",
        memo: "With Sam",
      }),
    ).toEqual({
      direction: "out",
      typed: "18.50",
      categoryId: "groceries",
      payee: "Corner Bistro",
      memo: "With Sam",
      date: "2026-10-12",
      accountId: "checking",
    });
  });

  it("reads money coming in, with no Payee or Category", () => {
    expect(
      draftOf({
        id: "paycheck",
        accountId: "checking",
        date: "2026-10-12",
        amount: money(5000, "USD"),
      }),
    ).toEqual({
      direction: "in",
      typed: "50.00",
      payee: "",
      date: "2026-10-12",
      accountId: "checking",
    });
  });
});

describe("dayBefore", () => {
  it("crosses a Month and a year", () => {
    expect(dayBefore("2026-10-15")).toBe("2026-10-14");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});
