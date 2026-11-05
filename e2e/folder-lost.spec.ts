import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  cancelNextFolderPicker,
  declineNextFolderAccess,
  filesInFolder,
  lapseFolderAccess,
  lapseFolderAccessNow,
  removeFolder,
} from "./folder";
import { budgetRow, createBudget, goTo, record } from "./helpers";
import { folderWritesFinished } from "./reload";

const banner = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Not saved to your folder yet" });
const reconnect = (page: Page) =>
  page.getByRole("button", { name: "Reconnect" });

async function aSavedBudget(page: Page) {
  await createBudget(page);
  await goTo(page, "Budget");
  await folderWritesFinished(page);
  await expect(banner(page)).toHaveCount(0);
}

const groceries = (amount: string) => ({
  date: new Date().toISOString().slice(0, 10),
  amount,
  category: "Groceries",
});

async function folderText(page: Page) {
  return (await filesInFolder(page)).map(({ text }) => text).join("");
}

test("with the folder gone, work carries on and Reconnect's picker gets it written", async ({
  page,
}) => {
  await aSavedBudget(page);
  await removeFolder(page);

  await record(page, groceries("12.34"));
  await expect(banner(page)).toBeVisible();

  // Every Place stays usable, and another change is held too.
  await record(page, groceries("56.78"));
  await goTo(page, "Budget");
  await expect(banner(page)).toBeVisible();
  await expect(budgetRow(page, "Groceries")).toContainText("69.12");

  await cancelNextFolderPicker(page);
  await reconnect(page).click();
  await expect(banner(page)).toBeVisible();

  await reconnect(page).click();
  await expect(banner(page)).toHaveCount(0);
  const written = await folderText(page);
  expect(written).toContain("-1234");
  expect(written).toContain("-5678");
});

test("with access lapsed, Reconnect asks for permission and gets it written", async ({
  page,
}) => {
  await aSavedBudget(page);
  await lapseFolderAccessNow(page);

  await record(page, groceries("12.34"));
  await expect(banner(page)).toBeVisible();

  await declineNextFolderAccess(page);
  await reconnect(page).click();
  await expect(banner(page)).toBeVisible();

  await reconnect(page).click();
  await expect(banner(page)).toHaveCount(0);
  expect(await folderText(page)).toContain("-1234");
});

test("changes held when the folder is lost are written after a reopen", async ({
  page,
}) => {
  await aSavedBudget(page);
  await removeFolder(page);
  await record(page, groceries("12.34"));
  await expect(banner(page)).toBeVisible();
  await page.reload();

  await page.getByRole("button", { name: "Choose a folder" }).click();
  await goTo(page, "Budget");
  await expect(budgetRow(page, "Groceries")).toContainText("12.34");
  await expect(banner(page)).toHaveCount(0);
  await folderWritesFinished(page);
  expect(await folderText(page)).toContain("-1234");
});

test("changes held when access lapsed are written after a reopen", async ({
  page,
}) => {
  await aSavedBudget(page);
  await lapseFolderAccessNow(page);
  await record(page, groceries("12.34"));
  await expect(banner(page)).toBeVisible();
  await lapseFolderAccess(page);
  await page.reload();

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await goTo(page, "Budget");
  await expect(budgetRow(page, "Groceries")).toContainText("12.34");
  await expect(banner(page)).toHaveCount(0);
  await folderWritesFinished(page);
  expect(await folderText(page)).toContain("-1234");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the banner has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await aSavedBudget(page);
    await removeFolder(page);
    await record(page, groceries("12.34"));
    await expect(banner(page)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      ),
    ).toEqual([]);
  });
}
