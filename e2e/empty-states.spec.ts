import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  activity,
  addAccount,
  assign,
  budgetRow,
  createBudget,
  goTo,
  openAccount,
  record,
  startEditing,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const coaching = (page: Page) =>
  page.getByText("Start at the top with what's due soonest.");
const noCategories = (page: Page) =>
  page.getByText(
    "No Categories yet. A Category is a job for your money, like Rent or Groceries.",
  );
const nothingRecorded = (page: Page) =>
  activity(page).getByText(
    "Nothing recorded yet. Record what you spend, and it shows up here.",
  );
const nothingHere = (page: Page) =>
  activity(page).getByText(
    "Nothing here yet. Add an Account, and everything that moves through it shows up here.",
  );
const spentCard = (page: Page) =>
  page.getByRole("region", { name: "Spent this Month" });

async function closeOnlyAccount(page: Page, name: string) {
  await openAccount(page, name);
  await page.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: `Close ${name}` }).click();
}

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);
}

test("the coaching note and highlighted first Category stay until anything is assigned", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");

  await expect(coaching(page)).toBeVisible();
  await expect(budgetRow(page, "Rent")).toHaveAttribute("data-coached");
  await expect(budgetRow(page, "Power")).not.toHaveAttribute("data-coached");
  await expectNoSeriousViolations(page);

  await reloadWhenSaved(page);
  await expect(coaching(page)).toBeVisible();

  await assign(page, "Groceries", "50");
  await expect(coaching(page)).toBeHidden();
  await expect(budgetRow(page, "Rent")).not.toHaveAttribute("data-coached");
});

test("a Budget with no Categories offers Add a Category, which leads to Edit mode", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await expect(noCategories(page)).toBeVisible();
  await expect(button(page, "Use the starter set")).toBeVisible();
  await expect(coaching(page)).toBeHidden();
  await expectNoSeriousViolations(page);

  await button(page, "Add a Category").click();
  const sheet = page.getByRole("dialog", { name: "Add a Category" });
  await sheet.getByLabel("Name").fill("Rent");
  await sheet.getByLabel("New Category Group").fill("Bills");
  await sheet.getByRole("button", { name: "Add Category" }).click();

  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Edit Categories" }),
  ).toBeVisible();
  await expect(toast(page)).toContainText("Added Rent");
  await expect(page.getByRole("region", { name: "Bills" })).toBeVisible();
  await expect(page.getByLabel("Name of Rent")).toBeVisible();

  await button(page, "Undo").click();
  await button(page, "Done").click();
  await expect(noCategories(page)).toBeVisible();
});

test("a blank name in the Add a Category sheet adds nothing and says so", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await button(page, "Add a Category").click();
  const sheet = page.getByRole("dialog", { name: "Add a Category" });
  await sheet.getByLabel("Name").fill(" ");
  await sheet.getByLabel("New Category Group").fill("Bills");
  await sheet.getByRole("button", { name: "Add Category" }).click();

  await expect(sheet.getByRole("alert")).toHaveText("A name can't be blank");
  await expect(sheet).toBeVisible();
});

test("Use the starter set fills the Budget, with Undo, and coaching takes over", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");

  await button(page, "Use the starter set").click();

  await expect(noCategories(page)).toBeHidden();
  await expect(toast(page)).toContainText("Added the starter set");
  await expect(budgetRow(page, "Rent")).toBeVisible();
  await expect(coaching(page)).toBeVisible();

  await button(page, "Undo").click();
  await expect(noCategories(page)).toBeVisible();
});

test("a Budget whose Groups have no Categories doesn't offer the starter set", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await startEditing(page);
  await button(page, "Add a Category Group").click();
  const field = page.getByRole("textbox", { name: "Add a Category Group" });
  await field.fill("Bills");
  await field.press("Enter");
  await expect(page.getByRole("region", { name: "Bills" })).toBeVisible();
  await button(page, "Done").click();

  await expect(noCategories(page)).toBeVisible();
  await expect(button(page, "Add a Category")).toBeVisible();
  await expect(button(page, "Use the starter set")).toBeHidden();
});

test("Activity keeps the Opening Balance rows until something is recorded", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");

  await expect(nothingRecorded(page)).toBeVisible();
  await expect(activity(page).getByText("Opening Balance")).toBeVisible();
  await expect(button(page, "Record a Transaction")).toBeVisible();
  await expectNoSeriousViolations(page);

  await record(page, { amount: "12", category: "Groceries" });
  await goTo(page, "Activity");
  await expect(nothingRecorded(page)).toBeHidden();
});

test("Activity with no open Account offers Add an Account", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "0" } });
  await closeOnlyAccount(page, "Checking");
  await goTo(page, "Activity");

  await expect(nothingHere(page)).toBeVisible();
  await expect(nothingRecorded(page)).toBeHidden();
  await expectNoSeriousViolations(page);

  await activity(page).getByRole("button", { name: "Add an Account" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Account" });
  await sheet.getByLabel("Name").fill("Wallet");
  await sheet.getByRole("button", { name: "Add Account" }).click();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
});

test("a new Account says it hasn't been checked and what checking means", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Wallet" });
  await expect(
    page.getByText(
      "Not checked yet. Now and then, see that this matches your bank.",
    ),
  ).toBeVisible();
});

test("Spent this Month's empty message goes with a Transaction in a left-out Group", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await expect(spentCard(page)).toContainText("Nothing recorded yet.");

  // The starter set leaves its Savings Group out.
  await record(page, { amount: "12", category: "Emergency Fund" });

  await expect(spentCard(page)).not.toContainText("Nothing recorded yet.");
  await expect(spentCard(page).getByRole("img")).toBeVisible();
  await expect(spentCard(page)).toContainText("$0.00");
});
