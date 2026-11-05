import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  clearLocalCopy,
  deliverFile,
  filesInFolder,
  holdReadingAfterOneFile,
  lapseFolderAccess,
} from "./folder";
import { createBudget, expectCurrency, goTo, openApp } from "./helpers";
import { folderWritesFinished } from "./reload";

const BUDGET_ID = "budget-from-another-device";

/** Files another device wrote. */
const budgetFiles = [
  {
    name: "laptop-2026-10.jsonl",
    text: `${JSON.stringify({
      id: "created",
      subjectId: BUDGET_ID,
      deviceId: "laptop",
      timestamp: { wallTime: Date.UTC(2026, 9, 1), counter: 0 },
      type: "BudgetCreated",
      payload: { currency: "SEK", version: 2, firstMonth: "2026-10" },
    })}\n`,
  },
  {
    name: "laptop-2026-11.jsonl",
    text: `${JSON.stringify({
      id: "account",
      subjectId: "savings",
      deviceId: "laptop",
      timestamp: { wallTime: Date.UTC(2026, 10, 1), counter: 0 },
      type: "AccountOpened",
      payload: {
        version: 1,
        name: "Laptop savings",
        kind: "savings",
        openingBalance: { minorUnits: 10000, currency: "SEK" },
      },
    })}\n`,
  },
];

async function putABudgetInTheFolder(page: Page) {
  await openApp(page);
  for (const { name, text } of budgetFiles) {
    await deliverFile(page, name, text);
  }
}

const startFirstRun = async (page: Page) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByText(
      "A folder already holding a Budget skips the remaining steps and opens it.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose a folder" }).click();
};

const reading = (page: Page) =>
  page.getByRole("heading", {
    name: "Getting your Budget from your folder",
    level: 1,
  });

test("first run opens a folder that already holds a Budget, skipping setup", async ({
  page,
}) => {
  await putABudgetInTheFolder(page);

  await startFirstRun(page);

  await goTo(page, "Budget");
  await expectCurrency(page, "SEK");
  await expect(
    page.getByRole("heading", { name: "What currency is your Budget in?" }),
  ).toHaveCount(0);
});

test("a full read blocks with a count and no partial Budget, and leaving resumes", async ({
  page,
}) => {
  await putABudgetInTheFolder(page);
  await holdReadingAfterOneFile(page);

  await startFirstRun(page);

  await expect(reading(page)).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("1 of 2");
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.map(({ id }) => id),
  ).toEqual([]);

  await page.reload();

  await goTo(page, "Budget");
  await expectCurrency(page, "SEK");
  await expect(reading(page)).toHaveCount(0);
});

test("a read left with access lapsed asks for the folder, then finishes", async ({
  page,
}) => {
  await putABudgetInTheFolder(page);
  await holdReadingAfterOneFile(page);
  await startFirstRun(page);
  await expect(page.getByRole("status")).toHaveText("1 of 2");

  await lapseFolderAccess(page);
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();

  await goTo(page, "Budget");
  await expectCurrency(page, "SEK");
});

test("a cleared Local Copy reads the Budget back from its folder", async ({
  page,
}) => {
  await createBudget(page, { currency: "SEK" });
  await goTo(page, "Budget");
  await folderWritesFinished(page);
  expect(await filesInFolder(page)).not.toHaveLength(0);

  await clearLocalCopy(page);
  await page.reload();

  await goTo(page, "Budget");
  await expectCurrency(page, "SEK");
});
