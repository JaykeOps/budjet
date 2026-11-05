import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  createBudget,
  expectBalance,
  goTo,
  openAccount,
  toast,
  transfer,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

const history = (page: Page, name = "All Accounts") =>
  page.getByRole("table", { name: `History of ${name}` });
const rowOf = (page: Page, name: RegExp, of?: string) =>
  history(page, of).getByRole("row", { name });
const openRow = (page: Page, name: RegExp, of?: string) =>
  rowOf(page, name, of).getByRole("button", { name: /^Open/ }).click();
/** Found even with a list open, which hides the rest of the page from assistive technology. */
const edit = (page: Page, what = "Transaction") =>
  page.getByRole("form", { name: `Edit ${what}`, includeHidden: true });
const amount = (page: Page, what?: string) =>
  edit(page, what).getByLabel("Amount");
const undo = (page: Page) => toast(page).getByRole("button", { name: "Undo" });

async function record(
  page: Page,
  payee: string,
  dollars: string,
  category = "gro",
) {
  await page.keyboard.type(payee);
  await page.keyboard.press("Tab");
  await page.keyboard.type(category);
  await page.keyboard.press("Tab");
  await page.keyboard.type(dollars);
  await page.keyboard.press("Enter");
  await expect(toast(page)).toContainText(`at ${payee}`);
}

/** A Budget holding $1,000 with Rewe ($20, Groceries) and Aldi ($30, Groceries). */
async function twoTransactions(page: Page) {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await record(page, "Rewe", "20");
  await record(page, "Aldi", "30");
  await page.keyboard.press("Escape");
}

test("a Transaction opens where it sits, filled in, with Delete, Cancel and Save changes", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);

  const form = edit(page);
  await expect(form.getByRole("combobox", { name: "Payee" })).toHaveValue(
    "Rewe",
  );
  await expect(form.getByRole("combobox", { name: "Payee" })).toBeFocused();
  await expect(
    form.getByRole("combobox", { name: "Category", includeHidden: true }),
  ).toHaveValue("Groceries");
  await expect(amount(page)).toHaveValue("20.00");
  await expect(form.getByLabel("Date")).toHaveValue("2026-10-15");
  await expect(form.getByLabel("Account")).toContainText("Checking");
  for (const name of ["Delete", "Cancel", /^Save changes/]) {
    await expect(form.getByRole("button", { name })).toBeVisible();
  }
  // It sits among its neighbours, not in a form above them.
  await expect(history(page).locator("form")).toHaveCount(1);
  await expect(rowOf(page, /Rewe/)).toHaveCount(0);
  await expect(rowOf(page, /Aldi/)).toBeVisible();
});

test("what's shown leaves out the money of the Transaction being edited", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);

  // Checking holds $950 with both, and $970 once this $20 is left out.
  await expect(edit(page).getByLabel("Account")).toContainText("$970.00");
  await expect(edit(page).getByText("Groceries after this:")).toContainText(
    "Overspent by $50.00",
  );
  await amount(page).fill("5");
  await expect(edit(page).getByText("Groceries after this:")).toContainText(
    "Overspent by $35.00",
  );
});

test("Enter saves with Undo, and focus returns to the row", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("25");
  await page.keyboard.press("Enter");

  await expect(edit(page)).toHaveCount(0);
  await expect(toast(page)).toContainText("Changes saved");
  await expect(rowOf(page, /Rewe/)).toContainText("−$25.00");
  await expect(
    rowOf(page, /Rewe/).getByRole("button", { name: /^Open/ }),
  ).toBeFocused();

  await undo(page).click();
  await expect(rowOf(page, /Rewe/)).toContainText("−$20.00");
  await expect(
    rowOf(page, /Rewe/).getByRole("button", { name: /^Open/ }),
  ).toBeFocused();
  await reloadWhenSaved(page);
  await expect(rowOf(page, /Rewe/)).toContainText("−$20.00");
});

test("Enter from each field saves, and with something missing moves there", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("");
  await page.keyboard.press("Enter");
  await expect(amount(page)).toBeFocused();
  await expect(edit(page)).toBeVisible();

  await amount(page).fill("21");
  await page.keyboard.press("Shift+Tab");
  await expect(
    edit(page).getByRole("combobox", { name: "Category", includeHidden: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toContainText("−$21.00");
});

test("the Save changes button saves", async ({ page }) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("26");
  await edit(page)
    .getByRole("button", { name: /^Save changes/ })
    .click();
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toContainText("−$26.00");
});

test("saving nothing new says nothing and writes nothing", async ({ page }) => {
  await twoTransactions(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toBeEmpty();
  await openRow(page, /Rewe/);
  await amount(page).fill("20");
  await page.keyboard.press("Enter");
  await expect(edit(page)).toHaveCount(0);
  await expect(toast(page)).toBeEmpty();
});

for (const [how, cancel] of [
  ["Esc", (page: Page) => page.keyboard.press("Escape")],
  [
    "Cancel",
    (page: Page) => edit(page).getByRole("button", { name: "Cancel" }).click(),
  ],
] as const) {
  test(`${how} discards the changes, and focus returns to the row`, async ({
    page,
  }) => {
    await twoTransactions(page);
    await openRow(page, /Rewe/);
    await amount(page).fill("99");
    await cancel(page);

    await expect(edit(page)).toHaveCount(0);
    await expect(rowOf(page, /Rewe/)).toContainText("−$20.00");
    await expect(
      rowOf(page, /Rewe/).getByRole("button", { name: /^Open/ }),
    ).toBeFocused();
  });
}

test("Esc on an open list of Categories only closes the list", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await edit(page)
    .getByRole("combobox", { name: "Category", includeHidden: true })
    .focus();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(edit(page)).toBeVisible();
});

test("choosing from a list with the pointer stays in the row", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await edit(page)
    .getByRole("combobox", { name: "Category", includeHidden: true })
    .focus();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Rent\b/ })
    .click();
  await expect(edit(page)).toBeVisible();
  await expect(
    edit(page).getByRole("combobox", { name: "Category", includeHidden: true }),
  ).toHaveValue("Rent");
  await expect(toast(page)).not.toContainText("Changes");
});

test("clicking another row saves the changes with Undo and opens that row", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Aldi/);
  await amount(page).fill("35");
  await openRow(page, /Rewe/);

  await expect(toast(page)).toContainText("Changes saved");
  await expect(rowOf(page, /Aldi/)).toContainText("−$35.00");
  await expect(amount(page)).toHaveValue("20.00");
  await expect(edit(page)).toHaveCount(1);

  await undo(page).click();
  await expect(rowOf(page, /Aldi/)).toContainText("−$30.00");
  // Undo in the toast isn't leaving the row that's open.
  await expect(amount(page)).toHaveValue("20.00");
});

test("clicking the row below an open row opens the one clicked, though the rows move", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Aldi/);
  await openRow(page, /Rewe/);
  await expect(edit(page).getByRole("combobox", { name: "Payee" })).toHaveValue(
    "Rewe",
  );
  await expect(toast(page)).not.toContainText("Changes");
});

test("clicking Record saves the changes with Undo and starts recording", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("25");
  await page
    .getByRole("navigation", { name: "Places" })
    .getByRole("button", { name: "Record" })
    .click();

  await expect(edit(page)).toHaveCount(0);
  await expect(toast(page)).toContainText("Changes saved");
  await expect(undo(page)).toBeVisible();
  await expect(rowOf(page, /Rewe/)).toContainText("−$25.00");
  await expect(page.getByRole("form", { name: "Record" })).toBeVisible();
});

test("Alt+N and tabbing out of the row are leaving it too", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("25");
  await page.keyboard.press("Alt+n");
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toContainText("−$25.00");
  await page.keyboard.press("Escape");

  await openRow(page, /Rewe/);
  await amount(page).fill("26");
  await edit(page)
    .getByRole("button", { name: /^Save changes/ })
    .focus();
  await page.keyboard.press("Tab");
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toContainText("−$26.00");
  await expect(page.locator(":focus")).toHaveAttribute(
    "aria-label",
    /^More for Rewe|^Open/,
  );
});

test("going to another place saves the changes, by link or by going back", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await record(page, "Rewe", "20");
  await page.keyboard.press("Escape");
  await openRow(page, /Rewe/);
  await amount(page).fill("25");
  await goTo(page, "Budget");
  await expect(toast(page)).toContainText("Changes saved");
  await page.goBack();
  await expect(rowOf(page, /Rewe/)).toContainText("−$25.00");

  await openRow(page, /Rewe/);
  await amount(page).fill("26");
  await page.goBack();
  await expect(toast(page)).toContainText("Changes saved");
  await page.goForward();
  await expect(rowOf(page, /Rewe/)).toContainText("−$26.00");
  await expect(edit(page)).toHaveCount(0);
});

test("clicking nothing in particular stays in the row, and Esc still works", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await amount(page).fill("99");
  await page.getByRole("heading", { name: "All Accounts" }).click();
  await expect(edit(page)).toBeVisible();
  await expect(amount(page)).toHaveValue("99");
  await page.keyboard.press("Escape");
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toContainText("−$20.00");
});

for (const [what, spoil] of [
  ["no amount", (page: Page) => amount(page).fill("")],
  ["a zero amount", (page: Page) => amount(page).fill("0")],
  [
    "money out with no Category",
    async (page: Page) => {
      await amount(page).focus();
      await page.keyboard.press("+");
      await page.keyboard.press("-");
    },
  ],
] as const) {
  test(`leaving with ${what} discards the changes and says so`, async ({
    page,
  }) => {
    await twoTransactions(page);
    await openRow(page, /Rewe/);
    await spoil(page);
    await openRow(page, /Aldi/);

    await expect(toast(page)).toContainText("Changes discarded");
    await expect(undo(page)).toHaveCount(0);
    await expect(rowOf(page, /Rewe/)).toContainText("−$20.00");
    await expect(rowOf(page, /Rewe/)).toContainText("Groceries");
    await expect(amount(page)).toHaveValue("30.00");
  });
}

test("Delete has no confirm, with Undo, and focus moves to the next row", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Aldi/);
  await edit(page).getByRole("button", { name: "Delete" }).click();

  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Aldi/)).toHaveCount(0);
  await expect(toast(page)).toContainText("Transaction deleted");
  await expect(
    rowOf(page, /Rewe/).getByRole("button", { name: /^Open/ }),
  ).toBeFocused();

  await undo(page).click();
  await expect(rowOf(page, /Aldi/)).toContainText("−$30.00");
  await expectBalance(page, "Checking", "$950.00");
});

test("a row moved to another Month by its new date is followed by focus", async ({
  page,
}) => {
  await twoTransactions(page);
  await openRow(page, /Rewe/);
  await edit(page).getByLabel("Date").fill("2026-09-20");
  await page.keyboard.press("Enter");
  await expect(edit(page)).toHaveCount(0);
  await expect(rowOf(page, /Rewe/)).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveCount(1);
  await expect(page.locator(":focus")).not.toHaveJSProperty("tagName", "BODY");
});

test("an open row stays open and keeps what's typed when scrolled far away", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await record(page, "Rewe", "20");
  for (let n = 0; n < 40; n += 1) {
    await record(page, `Shop ${n}`, "1");
  }
  await page.keyboard.press("Escape");
  await openRow(page, /Shop 39/);
  await amount(page).fill("7");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rowOf(page, /Rewe/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(amount(page)).toHaveValue("7");
});

test.describe("a Transfer", () => {
  async function aTransfer(page: Page) {
    await createBudget(page);
    await addAccount(page, { name: "Savings", kind: "Savings", holds: "500" });
    await transfer(page, { from: "Checking", to: "Savings", amount: "200" });
    await page.keyboard.press("Escape");
  }

  test("opens where it sits, and Enter saves with Undo", async ({ page }) => {
    await aTransfer(page);
    await openRow(page, /^To Savings/, "Checking");

    const form = edit(page, "Transfer");
    await expect(amount(page, "Transfer")).toBeFocused();
    await expect(amount(page, "Transfer")).toHaveValue("200.00");
    await expect(form.getByLabel("From")).toHaveValue(/.+/);
    await expect(form.getByLabel("Date")).toHaveValue("2026-10-15");
    // Checking holds $800 with it, and $1,000 once this $200 is left out.
    await expect(form.getByLabel("From")).toContainText("$1,000.00");
    await amount(page, "Transfer").fill("50");
    await expect(
      form.getByText("Checking goes to $950.00, Savings to $550.00."),
    ).toBeVisible();
    for (const name of ["Delete", "Cancel", /^Save changes/]) {
      await expect(form.getByRole("button", { name })).toBeVisible();
    }
    await page.keyboard.press("Enter");

    await expect(form).toHaveCount(0);
    await expect(toast(page)).toContainText("Changes saved");
    await expect(rowOf(page, /^To Savings/, "Checking")).toContainText(
      "−$50.00",
    );
    await undo(page).click();
    await expect(rowOf(page, /^To Savings/, "Checking")).toContainText(
      "−$200.00",
    );
  });

  test("leaving with no amount discards and says so; Delete has Undo", async ({
    page,
  }) => {
    await aTransfer(page);
    await openRow(page, /^To Savings/, "Checking");
    await amount(page, "Transfer").fill("");
    await openRow(page, /Opening Balance/, "Checking");
    await expect(toast(page)).toContainText("Changes discarded");
    await expect(rowOf(page, /^To Savings/, "Checking")).toContainText(
      "−$200.00",
    );

    await openRow(page, /^To Savings/, "Checking");
    await edit(page, "Transfer")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(toast(page)).toContainText("Transfer deleted");
    await expect(rowOf(page, /^To Savings/, "Checking")).toHaveCount(0);
    await undo(page).click();
    await expect(rowOf(page, /^To Savings/, "Checking")).toContainText(
      "−$200.00",
    );
  });
});

test.describe("rows that only read", () => {
  const readOnly = (page: Page, name: string) =>
    page.getByRole("region", { name, exact: true });

  async function closeAccount(page: Page, name: string) {
    await page.getByRole("button", { name: `More for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Close Account" }).click();
    await page.getByRole("button", { name: `Close ${name}` }).click();
  }

  test("an Opening Balance says what it is, with no Delete, and Esc closes it", async ({
    page,
  }) => {
    await createBudget(page);
    await goTo(page, "Activity");
    await openRow(page, /Opening Balance/);
    const row = readOnly(page, "Opening Balance");
    await expect(row).toContainText("What Checking held when you added it.");
    await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(row).toHaveCount(0);
    await expect(
      rowOf(page, /Opening Balance/).getByRole("button", { name: /^Open/ }),
    ).toBeFocused();
  });

  test("an Adjustment says what it did, and Delete has Undo", async ({
    page,
  }) => {
    await createBudget(page);
    await openAccount(page, "Checking");
    await page.getByRole("button", { name: "It's different" }).click();
    await page.getByLabel(/What your bank says/).fill("900");
    await page.getByRole("button", { name: "Update balance" }).click();
    await expect(toast(page)).toContainText("Checking is now");

    await openRow(page, /^Adjustment/, "Checking");
    const row = readOnly(page, "Adjustment");
    await expect(row).toContainText(
      "The difference went out of Ready to Assign.",
    );
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Adjustment deleted");
    await expect(rowOf(page, /^Adjustment/, "Checking")).toHaveCount(0);
    await undo(page).click();
    await expect(rowOf(page, /^Adjustment/, "Checking")).toHaveCount(1);
  });

  test("a Transaction or Transfer touching a closed Account says why, with nothing to change", async ({
    page,
  }) => {
    await createBudget(page);
    await addAccount(page, { name: "Savings", kind: "Savings", holds: "500" });
    await addAccount(page, { name: "Old", holds: "100" });
    await transfer(page, { from: "Old", to: "Savings", amount: "100" });
    await page.keyboard.press("Escape");
    await closeAccount(page, "Old");

    await openRow(page, /^To Savings/, "Old");
    const row = readOnly(page, "Transfer");
    await expect(row).toContainText("Old is closed, so this stays as it is");
    await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.locator("form[aria-label^=Edit]")).toHaveCount(0);

    // Leaving closes it, with nothing saved or discarded to mention.
    await openRow(page, /Opening Balance/, "Old");
    await expect(row).toHaveCount(0);
    await expect(readOnly(page, "Opening Balance")).toBeVisible();
    await readOnly(page, "Opening Balance")
      .getByRole("button", { name: "Close" })
      .click();
    await expect(readOnly(page, "Opening Balance")).toHaveCount(0);
    await expect(
      rowOf(page, /Opening Balance/, "Old").getByRole("button", {
        name: /^Open/,
      }),
    ).toBeFocused();
  });
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`open rows have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await page.keyboard.press("Alt+n");
    await record(page, "Rewe", "20");
    await page.keyboard.press("Escape");
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await openRow(page, /Rewe/);
    await scan();
    await page.keyboard.press("Escape");
    await openRow(page, /Opening Balance/);
    await scan();
  });
}
