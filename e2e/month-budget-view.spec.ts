import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  assign,
  budgetOutline,
  budgetRow,
  createBudget,
  expectAssigned,
  finishEditing,
  goTo,
  hideCategory,
  openMore,
  record,
  startEditing,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

const monthHeading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });
const meterOf = (page: Page, category: string) =>
  budgetRow(page, category).getByRole("meter");
const spentCard = (page: Page) =>
  page.getByRole("region", { name: "Spent this Month" });
const nextMonth = (page: Page) =>
  page.getByRole("button", { name: "Next Month" }).click();

test("the Budget opens on the current Month with every Category in its Category Group", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "0" } });
  await goTo(page, "Budget");
  await startEditing(page);
  const savings = await openMore(page, "Savings");
  await savings.getByRole("button", { name: "Up", exact: true }).click();
  await page.keyboard.press("Escape");
  await finishEditing(page);

  const expectOutline = () =>
    expect
      .poll(() => budgetOutline(page))
      .toEqual([
        "Bills",
        "Rent",
        "Power",
        "Phone",
        "Internet",
        "Savings",
        "Emergency Fund",
        "Everyday",
        "Groceries",
        "Transport",
        "Dining Out",
      ]);
  await expect(monthHeading(page, "October 2026")).toBeVisible();
  await expectOutline();

  await reloadWhenSaved(page);

  await expectOutline();
});

test("Ready to Assign's line changes with its amount", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(readyToAssign).toHaveText(/\$1,000\.00/);
  await expect(readyToAssign).toContainText(
    "This is the money in your Accounts. Give each dollar a job.",
  );

  await assign(page, "Rent", "400");
  await expect(readyToAssign).toHaveText(/\$600\.00/);
  await expect(readyToAssign).toContainText("Give these dollars a job.");

  await assign(page, "Rent", "1000");
  await expect(readyToAssign).toHaveText(/\$0\.00/);
  await expect(readyToAssign).toContainText("Every dollar has a job.");

  await assign(page, "Rent", "1200");
  const expectBelowZero = async () => {
    await expect(readyToAssign).toHaveText(/−\$200\.00/);
    await expect(readyToAssign).toContainText(
      "You've assigned more than you have. Take some back.",
    );
  };
  await expectBelowZero();

  await reloadWhenSaved(page);

  await expectBelowZero();
});

test("a user steps between Months, assigns money in a future Month and stays on it after a reload", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(monthHeading(page, "October 2026")).toBeVisible();

  await nextMonth(page);
  await expect(monthHeading(page, "November 2026")).toBeVisible();
  await expect(page).toHaveURL(/month=2026-11/);

  await nextMonth(page);
  await expect(monthHeading(page, "December 2026")).toBeVisible();
  await expect(page).toHaveURL(/month=2026-12/);

  await assign(page, "Rent", "150");
  await expect(readyToAssign).toHaveText(/\$850\.00/);

  await reloadWhenSaved(page);

  await expect(monthHeading(page, "December 2026")).toBeVisible();
  await expectAssigned(page, "Rent", "$150.00");
  await expect(readyToAssign).toHaveText(/\$850\.00/);

  await page.goBack();
  await expect(monthHeading(page, "November 2026")).toBeVisible();

  await page.getByRole("button", { name: "Previous Month" }).click();
  await expect(monthHeading(page, "October 2026")).toBeVisible();
  await expectAssigned(page, "Rent", "$0.00");
  await expect(readyToAssign).toHaveText(/\$850\.00/);
});

test("Months before the Budget was created can't be opened", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "0" } });
  await goTo(page, "Budget");
  await expect(monthHeading(page, "October 2026")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous Month" }),
  ).toBeDisabled();

  await page.goto("/?month=2026-09");
  await expect(monthHeading(page, "October 2026")).toBeVisible();
  await expect(page).toHaveURL(/month=2026-10/);

  await page.goto("/?month=not-a-month");
  await expect(monthHeading(page, "October 2026")).toBeVisible();
});

test("an Overspent Category reads Overspent with a full bar, in its Month and the next, until an Assignment covers it", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-12",
    amount: "150",
    category: "Groceries",
  });

  const groceries = budgetRow(page, "Groceries");
  const expectOverspent = async () => {
    await expect(groceries).toContainText("−$50.00");
    await expect(groceries).toContainText("Overspent by $50.00");
    await expect(meterOf(page, "Groceries")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  };

  await expectOverspent();
  await nextMonth(page);
  await expect(monthHeading(page, "November 2026")).toBeVisible();
  await expectOverspent();

  await reloadWhenSaved(page);
  await expectOverspent();

  await assign(page, "Groceries", "50");

  const covered = async () => {
    await expect(groceries).toContainText("$0.00");
    await expect(groceries).not.toContainText("Overspent");
    await expect(meterOf(page, "Groceries")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  };
  await covered();

  await reloadWhenSaved(page);
  await covered();
});

test("Overspent wins over negative Spending", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await record(page, {
    date: "2026-10-12",
    amount: "50",
    category: "Groceries",
  });
  await record(page, {
    date: "2026-11-02",
    amount: "12",
    category: "Groceries",
    money: "in",
  });
  await nextMonth(page);
  await expect(monthHeading(page, "November 2026")).toBeVisible();

  await expect(budgetRow(page, "Groceries")).toContainText(
    "Overspent by $38.00",
  );
  await expect(meterOf(page, "Groceries")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});

test("negative Spending reads as a signed figure, with no 'of' and an empty bar", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-03",
    amount: "20",
    category: "Groceries",
  });
  await record(page, {
    date: "2026-10-05",
    amount: "32",
    category: "Groceries",
    money: "in",
  });

  const groceries = budgetRow(page, "Groceries");
  await expect(groceries).toContainText("−$12.00");
  await expect(groceries).toContainText("$112.00");
  await expect(groceries).not.toContainText(" of ");
  await expect(meterOf(page, "Groceries")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );

  await expect(spentCard(page)).toContainText("−$12.00");
  await expect(spentCard(page)).not.toContainText(" of ");
  await expect(spentCard(page).getByRole("img")).toBeVisible();
});

test("Spent this Month is measured against the Month's Assignments with days to go", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await expect(spentCard(page)).toContainText(
    "Nothing recorded yet. Spending shows up here as you record it.",
  );
  await expect(spentCard(page).getByRole("img")).toBeHidden();

  await assign(page, "Groceries", "300");
  await record(page, {
    date: "2026-10-03",
    amount: "20",
    category: "Groceries",
  });

  await expect(spentCard(page)).toContainText("$20.00 of $300.00 assigned");
  await expect(spentCard(page).getByRole("img")).toBeVisible();
  await expect(spentCard(page)).toContainText("16 days to go.");

  await page.goto("/?month=2026-11");
  await expect(spentCard(page)).toContainText("Nothing recorded yet.");
});

test("rows read Spending against what the Category had", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "300");
  await record(page, {
    date: "2026-10-03",
    amount: "75",
    category: "Groceries",
  });

  await expect(budgetRow(page, "Groceries")).toContainText("$225.00");
  await expect(meterOf(page, "Groceries")).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(meterOf(page, "Rent")).toHaveAttribute("aria-valuenow", "0");
});

test("a hidden Category's Group doesn't show once nothing in it does", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await hideCategory(page, "Emergency Fund");

  await expect.poll(() => budgetOutline(page)).not.toContain("Savings");
});

test("`?` hints explain Ready to Assign, Available and Overspent in the Category's own numbers", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Dining Out", "60");
  await record(page, {
    date: "2026-10-03",
    amount: "80",
    category: "Dining Out",
  });

  const expectHint = async (button: string, text: string, index = 0) => {
    await page.getByRole("button", { name: button }).nth(index).click();
    await expect(page.getByRole("dialog")).toHaveText(text);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  };
  await expectHint(
    "What is Ready to Assign?",
    "The money in your Accounts that doesn't have a job yet.",
  );
  await expectHint(
    "What is Available?",
    "What a Category has left to spend this Month. Whatever's left carries into next Month.",
  );
  await expectHint(
    "What is Overspent?",
    "Dining Out had $60.00 and spent $80.00. Cover the $20.00, or it stays red, Month after Month.",
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the Budget screen has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page, { firstAccount: { openingBalance: "1000" } });
    await goTo(page, "Budget");
    await assign(page, "Rent", "100");
    await assign(page, "Dining Out", "10");
    await record(page, {
      date: "2026-10-03",
      amount: "80",
      category: "Dining Out",
    });
    await record(page, {
      date: "2026-10-04",
      amount: "40",
      category: "Rent",
      money: "in",
    });
    await expect(budgetRow(page, "Dining Out")).toContainText("Overspent");

    const { violations } = await new AxeBuilder({ page }).analyze();

    const serious = violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );
    expect(serious).toEqual([]);
  });
}
