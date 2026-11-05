import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  assign,
  budgetRow,
  categoryChoice,
  categoryStep,
  createBudget,
  enterTransaction,
  expectBalance,
  goTo,
  openAccount,
  reviewStep,
  startRecording,
  toast,
} from "./helpers";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

/** From (+) through How much?, to the Category step. */
async function atCategoryStep(page: Page, amount: string, money = "out") {
  const first = await startRecording(page);
  if (money === "in") {
    await first.getByRole("radio", { name: "Money in" }).check();
  }
  await first.getByLabel("Amount").fill(amount);
  await first.getByRole("button", { name: "Next" }).click();
  return categoryStep(page);
}

test("(+) opens a menu of two: Record a Transaction and Make a Transfer", async ({
  page,
}) => {
  await createBudget(page);

  await page.getByRole("button", { name: "Record", exact: true }).click();

  const items = page
    .getByRole("menu", { name: "Record" })
    .getByRole("menuitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAccessibleName(/^Record a Transaction/);
  await expect(items.nth(1)).toHaveAccessibleName(/^Make a Transfer/);
  // The Glossary keeps "move" for money between Categories.
  await expect(items.nth(1)).toContainText(
    "Money from one of your Accounts to another",
  );

  await page.keyboard.press("Escape");
  await expect(items).toHaveCount(0);
});

test("How much? asks for an amount above zero on a number keyboard, in or out", async ({
  page,
}) => {
  await createBudget(page);

  const step = await startRecording(page);
  const amount = step.getByLabel("Amount");
  const next = step.getByRole("button", { name: "Next" });

  await expect(amount).toHaveAttribute("inputmode", "decimal");
  await expect(amount).toBeFocused();
  await expect(step.getByRole("radio", { name: "Money out" })).toBeChecked();
  await expect(step.getByRole("radio", { name: "Money in" })).not.toBeChecked();
  await expect(next).toBeDisabled();
  await amount.fill("0");
  await expect(next).toBeDisabled();
  await amount.fill("0.01");
  await expect(next).toBeEnabled();
  await amount.fill("0.001");
  await expect(next).toBeDisabled();
});

test("the Category step finds Categories, in Groups, each with Available now and after", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Dining Out", "50");

  const step = await atCategoryStep(page, "18.50");

  await expect(step).toHaveAccessibleName("What was it for?");
  await expect(step.getByRole("region", { name: "Everyday" })).toBeVisible();
  await expect(
    step.getByRole("button", { name: /^Ready to Assign/ }),
  ).toHaveCount(0);
  const dining = categoryChoice(page, "Dining Out");
  await expect(dining).toContainText("$50.00");
  await expect(dining).toContainText("$31.50");
  await expect(categoryChoice(page, "Rent")).toContainText("−$18.50");

  await step.getByLabel("Find a Category").fill("din");
  await expect(dining).toBeVisible();
  await expect(categoryChoice(page, "Rent")).toHaveCount(0);
  await step.getByLabel("Find a Category").fill("nothing like this");
  await expect(step).toContainText('No Category called "nothing like this"');
});

test("money in lists Ready to Assign first", async ({ page }) => {
  await createBudget(page);

  const step = await atCategoryStep(page, "200", "in");

  await expect(step).toHaveAccessibleName("Where does it go?");
  const first = step.getByRole("listitem").first();
  await expect(first.getByRole("button")).toHaveAccessibleName(
    /^Ready to Assign.* \$1,000\.00 now \$1,200\.00 after this$/,
  );
});

test("a Transaction is recorded through the three steps, with a toast", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await goTo(page, "Budget");
  await assign(page, "Dining Out", "50");

  await atCategoryStep(page, "18.50");
  await categoryChoice(page, "Dining Out").click();

  const review = reviewStep(page);
  await expect(review).toContainText("Money out");
  await expect(review).toContainText("−$18.50");
  await expect(review).toContainText("Dining Out after this$31.50 left");
  await expect(review.getByRole("button", { name: "Today" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await review.getByRole("button", { name: "Yesterday" }).click();
  await review.getByLabel("Payee").fill("Corner Bistro");
  await expect(review.getByLabel("Account").locator("option")).toHaveText([
    "Checking · $1,000.00",
    "Savings · $500.00",
  ]);
  await review.getByRole("button", { name: "Record", exact: true }).click();

  await expect(review).toBeHidden();
  await expect(toast(page)).toHaveText(/^Recorded −\$18\.50 at Corner Bistro/);
  await expect(budgetRow(page, "Dining Out")).toContainText("$31.50");

  await goTo(page, "Activity");
  const row = page
    .getByRole("table", { name: "History of All Accounts" })
    .getByRole("row", { name: /Corner Bistro/ });
  await expect(row).toContainText(/Dining Out, Checking.*−\$18\.50/);
  await expect(row).toContainText("Oct 14");
});

test("the date can be another day, and Available follows its Month", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Dining Out", "50");

  await atCategoryStep(page, "10");
  await categoryChoice(page, "Dining Out").click();
  const review = reviewStep(page);
  await review.getByLabel("Another day").fill("2026-09-03");

  await expect(review.getByRole("button", { name: "Today" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(review).toContainText("Sep 3");
  await expect(review).toContainText("Overspent by $10.00");
});

test("tapping the amount or Category on the review goes to that step and back", async ({
  page,
}) => {
  await createBudget(page);
  await atCategoryStep(page, "10");
  await categoryChoice(page, "Rent").click();
  const review = reviewStep(page);

  await review.getByRole("button", { name: /^Money out/ }).click();
  const amount = page.getByRole("dialog", { name: "How much?" });
  await amount.getByLabel("Amount").fill("25");
  await amount.getByRole("button", { name: "Next" }).click();
  await expect(review).toContainText("−$25.00");
  await expect(review).toContainText("Rent");

  await review.getByRole("button", { name: /^Category/ }).click();
  await categoryChoice(page, "Power").click();
  await expect(review).toContainText("Power");

  await review.getByRole("button", { name: "‹ Back" }).click();
  await categoryStep(page).getByRole("button", { name: "‹ Back" }).click();
  await expect(page.getByRole("dialog", { name: "How much?" })).toBeVisible();
});

test("a known Payee fills in its Account, and leaves a chosen Category", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await enterTransaction(page, {
    amount: "12",
    category: "Dining Out",
    payee: "Corner Bistro",
    account: "Savings",
  });

  await atCategoryStep(page, "18.50");
  await categoryChoice(page, "Groceries").click();
  const review = reviewStep(page);
  await review.getByLabel("Payee").fill("corn");
  await review.getByRole("button", { name: "Corner Bistro" }).click();

  await expect(review.getByLabel("Payee")).toHaveValue("Corner Bistro");
  await expect(
    review.getByLabel("Account").locator("option:checked"),
  ).toHaveText("Savings · $488.00");
  await expect(review.getByRole("button", { name: /^Category/ })).toContainText(
    "Groceries",
  );
});

test("a known Payee fills in its last Category when none is chosen", async ({
  page,
}) => {
  await createBudget(page);
  await enterTransaction(page, {
    amount: "12",
    category: "Dining Out",
    payee: "Corner Bistro",
  });

  // Turning money in to money out on the review leaves no Category chosen.
  await atCategoryStep(page, "18.50", "in");
  await categoryChoice(page, "Ready to Assign").click();
  const review = reviewStep(page);
  await review.getByRole("button", { name: /^Money in/ }).click();
  const amount = page.getByRole("dialog", { name: "How much?" });
  await amount.getByRole("radio", { name: "Money out" }).check();
  await amount.getByRole("button", { name: "Next" }).click();
  await expect(review.getByRole("button", { name: /^Category/ })).toContainText(
    "Choose a Category",
  );
  await expect(
    review.getByRole("button", { name: "Record", exact: true }),
  ).toBeDisabled();

  await review.getByLabel("Payee").fill("Corner Bistro");

  await expect(review.getByRole("button", { name: /^Category/ })).toContainText(
    "Dining Out",
  );
  await review.getByRole("button", { name: "Record", exact: true }).click();
  await expect(toast(page)).toHaveText(/^Recorded −\$18\.50 at Corner Bistro/);
});

test("recording starts in the Account showing, stays there, and can be undone", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await openAccount(page, "Savings");

  await atCategoryStep(page, "20", "in");
  await categoryChoice(page, "Ready to Assign").click();
  await expect(
    reviewStep(page).getByLabel("Account").locator("option:checked"),
  ).toHaveText("Savings · $500.00");
  await reviewStep(page)
    .getByRole("button", { name: "Record", exact: true })
    .click();

  await expect(toast(page)).toHaveText(/^Recorded \+\$20\.00/);
  await expect(
    page.getByRole("heading", { name: "Savings", level: 1 }),
  ).toBeVisible();
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expectBalance(page, "Savings", "$500.00");
});

test("Make a Transfer moves money from (+), with a toast", async ({ page }) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await goTo(page, "Budget");

  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make a Transfer" }).click();
  const sheet = page.getByRole("dialog", { name: "Make a Transfer" });
  await expect(
    sheet.getByText("Your Categories and Ready to Assign don't change."),
  ).toBeVisible();
  await sheet.getByLabel("Amount").fill("200");
  await sheet.getByRole("button", { name: /^Transfer/ }).click();

  await expect(sheet).toBeHidden();
  await expect(toast(page)).toHaveText(/^Transfer made/);
  await expectBalance(page, "Savings", "$700.00");
});

test("Alt+N starts nothing on a phone, as recording starts from (+)", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");

  await page.keyboard.press("Alt+n");

  await expect(page.getByRole("form", { name: "Record" })).toBeHidden();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`recording has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("menu", { name: "Record" })).toBeVisible();
    await scan();
    await page.getByRole("menuitem", { name: "Record a Transaction" }).click();
    const amount = page.getByRole("dialog", { name: "How much?" });
    await amount.getByLabel("Amount").fill("20");
    await scan();
    await amount.getByRole("button", { name: "Next" }).click();
    await expect(categoryStep(page)).toBeVisible();
    await scan();
    await categoryChoice(page, "Rent").click();
    await expect(reviewStep(page)).toBeVisible();
    await scan();
  });
}
