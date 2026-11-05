import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  activity,
  addAccount,
  assign,
  balanceOf,
  budgetRow,
  categoryChoice,
  categoryStep,
  createBudget,
  deleteEntry,
  enterTransaction,
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

function history(page: Page): Locator {
  return page.getByRole("table", { name: /^History of/ });
}

function row(page: Page, name: RegExp): Locator {
  return history(page).getByRole("row", { name });
}

async function open(page: Page, name: RegExp): Promise<void> {
  await row(page, name).getByRole("button", { name: /^Open/ }).click();
}

const undo = (page: Page) =>
  toast(page).getByRole("button", { name: "Undo" }).click();

/** The history's rows, leaving out Statements, by their first lines. */
async function outline(page: Page): Promise<string[]> {
  return history(page)
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: /^Open/ }) })
    .locator("td:first-child > span:first-child")
    .allInnerTexts();
}

test("a Transaction opens as Edit Transaction, whose amount and Category go to that step and back", async ({
  page,
}) => {
  await createBudget(page);
  await assign(page, "Groceries", "100");
  await goTo(page, "Activity");
  await enterTransaction(page, {
    amount: "18.50",
    category: "Groceries",
    payee: "Corner Bistro",
  });

  await open(page, /Corner Bistro/);

  const edit = page.getByRole("dialog", { name: "Edit Transaction" });
  await expect(edit.getByLabel("Payee")).toHaveValue("Corner Bistro");
  await expect(edit.getByRole("button", { name: /Money out/ })).toContainText(
    "−$18.50",
  );
  await expect(edit.getByText("3 of 3")).toHaveCount(0);
  // Available and the balance leave out the Transaction being edited.
  await expect(edit.getByText("Groceries after this")).toBeVisible();
  await expect(edit.getByText("$81.50 left")).toBeVisible();
  await expect(edit.getByLabel("Account")).toContainText(
    "Checking · $1,000.00",
  );

  await edit.getByRole("button", { name: /Money out/ }).click();
  const amount = page.getByRole("dialog", { name: "How much?" });
  await expect(amount.getByLabel("Amount")).toHaveValue("18.50");
  await amount.getByLabel("Amount").fill("20");
  await amount.getByRole("button", { name: "Next" }).click();

  await expect(edit.getByText("$80.00 left")).toBeVisible();
  await edit.getByRole("button", { name: /Category/ }).click();
  await expect(categoryChoice(page, "Groceries")).toContainText("$100.00");
  await categoryChoice(page, "Dining Out").click();
  await expect(categoryStep(page)).toHaveCount(0);
  await expect(edit.getByRole("button", { name: /Category/ })).toContainText(
    "Dining Out",
  );
  await edit.getByRole("button", { name: "Save changes" }).click();

  await expect(edit).toHaveCount(0);
  await expect(toast(page)).toContainText("Changes saved");
  await expect(row(page, /Corner Bistro/)).toContainText("Dining Out");
  await expect(row(page, /Corner Bistro/)).toContainText("−$20.00");
});

test("Undo on an edit writes the previous values back, and they last", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");
  await enterTransaction(page, {
    amount: "18.50",
    category: "Groceries",
    payee: "Corner Bistro",
  });

  await open(page, /Corner Bistro/);
  const edit = page.getByRole("dialog", { name: "Edit Transaction" });
  await edit.getByLabel("Payee").fill("Somewhere else");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(row(page, /Somewhere else/)).toHaveCount(1);

  await undo(page);

  await expect(toast(page)).toBeEmpty();
  await expect(row(page, /Corner Bistro/)).toContainText("−$18.50");
  await reloadWhenSaved(page);
  await expect(row(page, /Corner Bistro/)).toContainText("−$18.50");
  await expect(row(page, /Somewhere else/)).toHaveCount(0);
});

test("Delete has no confirm, and Undo brings the Transaction back in the same place", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");
  for (const payee of ["First", "Second", "Third"]) {
    await enterTransaction(page, {
      amount: "10",
      category: "Groceries",
      payee,
    });
  }
  const before = await outline(page);

  await deleteEntry(page, row(page, /Second/));

  await expect(toast(page)).toContainText("Transaction deleted");
  await expect(row(page, /Second/)).toHaveCount(0);
  await expectBalance(page, "Checking", "$980.00");
  await goTo(page, "Activity");

  await undo(page);

  await expect(row(page, /Second/)).toHaveCount(1);
  await expect.poll(() => outline(page)).toEqual(before);
  await reloadWhenSaved(page);
  await expect.poll(() => outline(page)).toEqual(before);
  await expectBalance(page, "Checking", "$970.00");
});

test("Undo applies to the latest toast only, while it shows", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");
  for (const payee of ["First", "Second"]) {
    await enterTransaction(page, {
      amount: "10",
      category: "Groceries",
      payee,
    });
  }

  await deleteEntry(page, row(page, /First/));
  await deleteEntry(page, row(page, /Second/));
  await expect(toast(page).getByRole("button", { name: "Undo" })).toHaveCount(
    1,
  );

  await undo(page);

  await expect(row(page, /Second/)).toHaveCount(1);
  await expect(row(page, /First/)).toHaveCount(0);

  await deleteEntry(page, row(page, /Second/));
  await expect(toast(page)).toContainText("Transaction deleted");
  await expect(toast(page).getByRole("button", { name: "Undo" })).toHaveCount(
    0,
    { timeout: 8000 },
  );
});

test("a Transfer opens as Edit Transfer, and editing and deleting it can be undone", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", kind: "Savings", holds: "500" });
  await openAccount(page, "Checking");
  await transfer(page, { from: "Checking", to: "Savings", amount: "200" });
  const balanceIs = (amount: string) =>
    expect(balanceOf(page, "Checking")).toContainText(amount);
  await balanceIs("$800.00");

  await open(page, /^To Savings/);
  const edit = page.getByRole("dialog", { name: "Edit Transfer" });
  await edit.getByLabel("Amount").fill("50");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toContainText("Changes saved");
  await balanceIs("$950.00");
  await undo(page);
  await balanceIs("$800.00");

  await open(page, /^To Savings/);
  await edit.getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Transfer deleted");
  await balanceIs("$1,000.00");
  await undo(page);
  await balanceIs("$800.00");
  await expect(row(page, /^To Savings/)).toHaveCount(1);
  await reloadWhenSaved(page);
  await balanceIs("$800.00");
});

test("an Adjustment opens read-only with Delete, and undoing that restores what it did, not what it would do now", async ({
  page,
}) => {
  await createBudget(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "It's different" }).click();
  await page.getByLabel(/What your bank says/).fill("900");
  await page.getByRole("button", { name: "Update balance" }).click();
  await enterTransaction(page, {
    amount: "50",
    category: "Groceries",
    payee: "Later",
  });
  const balanceIs = (amount: string) =>
    expect(balanceOf(page, "Checking")).toContainText(amount);
  await balanceIs("$850.00");
  const before = await outline(page);

  await open(page, /^Adjustment/);
  const sheet = page.getByRole("dialog", { name: "Adjustment" });
  await expect(sheet).toContainText("−$100.00");
  await expect(sheet).toContainText("You updated the balance to $900.00");
  await expect(sheet.getByRole("textbox")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Delete" }).click();

  await expect(toast(page)).toContainText("Adjustment deleted");
  await balanceIs("$950.00");

  await undo(page);

  await balanceIs("$850.00");
  await expect(row(page, /^Adjustment/)).toContainText("−$100.00");
  await expect.poll(() => outline(page)).toEqual(before);
  await reloadWhenSaved(page);
  await balanceIs("$850.00");
  await expect.poll(() => outline(page)).toEqual(before);
});

test("a Balance check opens read-only with Delete, and an Opening Balance with none", async ({
  page,
}) => {
  await createBudget(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "It matches" }).click();

  await open(page, /Balance checked/);
  const check = page.getByRole("dialog", { name: "Balance check" });
  await expect(check).toContainText("Matched your bank at $1,000.00");
  await check.getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Balance check deleted");
  await expect(row(page, /Balance checked/)).toHaveCount(0);
  await undo(page);
  await expect(row(page, /Balance checked/)).toHaveCount(1);

  await open(page, /Opening Balance/);
  const opening = page.getByRole("dialog", { name: "Opening Balance" });
  await expect(opening).toContainText("What Checking held when you added it.");
  await expect(opening.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("rows touching a closed Account say so, in a sheet with nothing to change", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Old joint account", holds: "100" });
  await enterTransaction(page, {
    amount: "100",
    category: "Groceries",
    payee: "Last one",
    account: "Old joint account",
  });
  await addAccount(page, { name: "Savings", kind: "Savings", holds: "0" });
  await openAccount(page, "Old joint account");
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old joint account" }).click();

  const reason = "Old joint account is closed, so this stays as it is";
  for (const [name, title] of [
    [/Last one/, "Transaction"],
    [/Opening Balance/, "Opening Balance"],
  ] as const) {
    await open(page, name);
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet).toContainText(reason);
    await expect(sheet.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(sheet.getByRole("textbox")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  }
});

test("a Transfer touching a closed Account opens read-only too", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Old joint account", holds: "100" });
  await transfer(page, {
    from: "Old joint account",
    to: "Checking",
    amount: "100",
  });
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old joint account" }).click();

  await open(page, /^To Checking/);

  const sheet = page.getByRole("dialog", { name: "Transfer" });
  await expect(sheet).toContainText(
    "Old joint account is closed, so this stays as it is",
  );
  await expect(sheet.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`editing and read-only sheets have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await goTo(page, "Activity");
    await enterTransaction(page, {
      amount: "18.50",
      category: "Groceries",
      payee: "Corner Bistro",
    });
    const serious = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(({ impact }) =>
          ["serious", "critical"].includes(impact ?? ""),
        ),
      ).toEqual([]);
    };
    await expect(activity(page)).toBeVisible();
    await serious();

    await open(page, /Corner Bistro/);
    await expect(
      page.getByRole("dialog", { name: "Edit Transaction" }),
    ).toBeVisible();
    await serious();
    await page.keyboard.press("Escape");

    await open(page, /Opening Balance/);
    await expect(
      page.getByRole("dialog", { name: "Opening Balance" }),
    ).toBeVisible();
    await serious();
  });
}

test("the Budget follows a deleted Transaction brought back by Undo", async ({
  page,
}) => {
  await createBudget(page);
  await assign(page, "Groceries", "100");
  await goTo(page, "Activity");
  await enterTransaction(page, {
    amount: "40",
    category: "Groceries",
    payee: "Shop",
  });
  await deleteEntry(page, row(page, /Shop/));
  await undo(page);
  await goTo(page, "Budget");
  await expect(budgetRow(page, "Groceries")).toContainText("$60.00");
});
