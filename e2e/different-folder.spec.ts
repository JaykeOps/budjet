import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  deliverFile,
  filesInFolder,
  holdReadingAfterOneFile,
  PICKED_FOLDER,
  pickFolderNext,
  removeFolder,
} from "./folder";
import { budgetRow, createBudget, goTo, openApp, record } from "./helpers";
import { folderWritesFinished } from "./reload";

const OTHER_FOLDER = "their-folder";
const LOST = `We can't find your folder, ${PICKED_FOLDER}.`;
const TWO_BUDGETS = `A different Budget is in your folder, ${PICKED_FOLDER}.`;
const REFUSAL =
  "This folder holds a different Budget, and you have changes that haven't been saved.";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, level: 1 });

const theirBudget = `${JSON.stringify({
  id: "their-budget",
  subjectId: "their-budget-id",
  deviceId: "laptop",
  timestamp: { wallTime: Date.UTC(2026, 9, 1), counter: 0 },
  type: "BudgetCreated",
  payload: { currency: "SEK", version: 2, firstMonth: "2026-10" },
})}\n`;

async function aSavedBudget(page: Page) {
  await createBudget(page);
  await goTo(page, "Budget");
  await folderWritesFinished(page);
}

const groceries = {
  date: new Date().toISOString().slice(0, 10),
  amount: "12.34",
  category: "Groceries",
};

/** A saved Budget that has lost its folder, with one change held. */
async function aChangeHeld(page: Page) {
  await aSavedBudget(page);
  await removeFolder(page);
  await record(page, groceries);
  await expect(button(page, "Reconnect")).toBeVisible();
}

async function lapseToLostScreen(page: Page) {
  await removeFolder(page);
  await page.reload();
  await expect(heading(page, LOST)).toBeVisible();
}

const axeViolations = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.map(({ id }) => id);

const startFirstRun = async (page: Page) => {
  await button(page, "Get started").click();
  await button(page, "Choose a folder").click();
};

test("first run says so for an empty folder, and only then goes to setup", async ({
  page,
}) => {
  await openApp(page);
  await startFirstRun(page);

  await expect(
    heading(page, `There's no Budget in ${PICKED_FOLDER}.`),
  ).toBeFocused();
  await expect(button(page, "Choose another")).toBeVisible();
  await expect(button(page, "Put my Budget here")).toHaveCount(0);
  await expect(page.getByLabel("Currency")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await button(page, "Start a new Budget").click();
  await expect(page.getByLabel("Currency")).toBeVisible();
});

test("first run stops at a folder holding two Budgets", async ({ page }) => {
  await openApp(page);
  await deliverFile(page, "their-file", theirBudget);
  await deliverFile(
    page,
    "another-file",
    theirBudget.replaceAll("their-budget", "second-budget"),
  );

  await startFirstRun(page);

  await expect(heading(page, TWO_BUDGETS)).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("the lost screen opens the same Budget where it was moved", async ({
  page,
}) => {
  await aSavedBudget(page);
  for (const { name, text } of await filesInFolder(page)) {
    await deliverFile(page, name, text, "moved");
  }
  await removeFolder(page);
  await page.reload();

  await pickFolderNext(page, "moved");
  await button(page, "Choose a folder").click();

  await goTo(page, "Budget");
  await expect(page.getByText("Kept in USD")).toBeVisible();
  await expect(button(page, "Reconnect")).toHaveCount(0);
});

test("all saved, a different Budget shows progress, then replaces the Local Copy", async ({
  page,
}) => {
  await aSavedBudget(page);
  await deliverFile(page, "their-file", theirBudget, OTHER_FOLDER);
  await lapseToLostScreen(page);

  // Leaving during the read keeps the Budget that was there.
  await holdReadingAfterOneFile(page);
  await pickFolderNext(page, OTHER_FOLDER);
  await button(page, "Choose a folder").click();
  await expect(
    heading(page, "Getting your Budget from your folder"),
  ).toBeVisible();
  await page.reload();
  await expect(heading(page, LOST)).toBeVisible();

  await pickFolderNext(page, OTHER_FOLDER);
  await button(page, "Choose a folder").click();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in SEK")).toBeVisible();

  await page.reload();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in SEK")).toBeVisible();
});

test("Reconnect with unsaved changes refuses a different Budget until they're discarded", async ({
  page,
}) => {
  await aChangeHeld(page);
  await deliverFile(page, "their-file", theirBudget, OTHER_FOLDER);

  await pickFolderNext(page, OTHER_FOLDER);
  await button(page, "Reconnect").click();
  await expect(heading(page, REFUSAL)).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);

  await button(page, "Discard my changes and open it").click();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in SEK")).toBeVisible();
  await expect(budgetRow(page, "Groceries")).toHaveCount(0);
  const files = await filesInFolder(page, OTHER_FOLDER);
  expect(files.map(({ text }) => text).join("")).not.toContain("-1234");
});

test("the lost screen refuses too, and each next choice goes through the same check", async ({
  page,
}) => {
  await aChangeHeld(page);
  await deliverFile(page, "their-file", theirBudget, OTHER_FOLDER);
  await page.reload();

  await pickFolderNext(page, OTHER_FOLDER);
  await button(page, "Choose a folder").click();
  await expect(heading(page, REFUSAL)).toBeVisible();

  await pickFolderNext(page, "empty");
  await button(page, "Choose another").click();
  await expect(heading(page, "There's no Budget in empty.")).toBeVisible();

  await button(page, "Start a new Budget").click();
  await expect(
    heading(
      page,
      "Starting a new Budget leaves behind changes that haven't been saved.",
    ),
  ).toBeVisible();

  await pickFolderNext(page, "empty");
  await button(page, "Choose another").click();
  await button(page, "Put my Budget here").click();
  await goTo(page, "Budget");
  await expect(budgetRow(page, "Groceries")).toContainText("12.34");
  await folderWritesFinished(page);
  const written = (await filesInFolder(page, "empty"))
    .map(({ text }) => text)
    .join("");
  expect(written).toContain("BudgetCreated");
  expect(written).toContain("-1234");
});

test("Start a new Budget from the lost screen goes to setup", async ({
  page,
}) => {
  await aSavedBudget(page);
  await lapseToLostScreen(page);

  await pickFolderNext(page, "empty");
  await button(page, "Choose a folder").click();
  await button(page, "Start a new Budget").click();

  await expect(page.getByLabel("Currency")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("a background check finding a different Budget stops, naming the folder, and merges nothing", async ({
  page,
}) => {
  await aSavedBudget(page);
  await deliverFile(page, "their-file", theirBudget);

  await page.reload();

  await expect(heading(page, TWO_BUDGETS)).toBeVisible();
  await expect(
    page.getByText("Pick a clean folder to keep your Budget in."),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  // A clean folder gets the Budget, with none of the other in it.
  await pickFolderNext(page, "clean");
  await button(page, "Choose a folder").click();
  await button(page, "Put my Budget here").click();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in USD")).toBeVisible();
  await folderWritesFinished(page);
  const written = (await filesInFolder(page, "clean"))
    .map(({ text }) => text)
    .join("");
  expect(written).toContain("BudgetCreated");
  expect(written).not.toContain("their-budget");
});
