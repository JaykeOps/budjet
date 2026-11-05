import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  cancelNextFolderPicker,
  declineNextFolderAccess,
  lapseFolderAccess,
  PICKED_FOLDER,
  removeFolder,
} from "./folder";
import { createBudget, expectCurrency, goTo } from "./helpers";
import { folderWritesFinished, reloadWhenSaved } from "./reload";

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, level: 1 });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const places = (page: Page) => page.getByRole("navigation", { name: "Places" });

test("a lapsed folder shows Open your Budget before the app, and one tap opens the Budget", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await lapseFolderAccess(page);
  await reloadWhenSaved(page);

  await expect(heading(page, "Open your Budget")).toBeFocused();
  await expect(page.getByText(PICKED_FOLDER)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(places(page)).toHaveCount(0);
  await expect(
    page.getByText("Install Crownkeep to skip this step."),
  ).toHaveCount(0);

  await declineNextFolderAccess(page);
  await button(page, "Open").click();
  await expect(heading(page, "Open your Budget")).toBeVisible();
  await expect(places(page)).toHaveCount(0);

  await button(page, "Open").click();
  await goTo(page, "Budget");
  await expect(places(page)).toBeVisible();
  await expectCurrency(page, "USD");
});

test("Open your Budget mentions installing where the browser offers it", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await lapseFolderAccess(page);
  await reloadWhenSaved(page);
  await expect(heading(page, "Open your Budget")).toBeVisible();

  await page.evaluate(() =>
    window.dispatchEvent(new Event("beforeinstallprompt")),
  );

  await expect(
    page.getByText("Install Crownkeep to skip this step."),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
});

test("a lost folder is found by trying it, and choosing it again opens the Budget", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await folderWritesFinished(page);
  await removeFolder(page);
  await page.reload();

  await expect(
    heading(page, `We can't find your folder, ${PICKED_FOLDER}.`),
  ).toBeFocused();
  await expect(
    page.getByText("If you moved it, choose it in its new place."),
  ).toBeVisible();
  await expect(places(page)).toHaveCount(0);

  await cancelNextFolderPicker(page);
  await button(page, "Choose a folder").click();
  await expect(places(page)).toHaveCount(0);

  await button(page, "Choose a folder").click();
  await button(page, "Put my Budget here").click();
  await goTo(page, "Budget");
  await expectCurrency(page, "USD");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`coming back to a folder has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    const expectNoSeriousViolations = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      );
      expect(serious).toEqual([]);
    };
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await goTo(page, "Budget");
    await folderWritesFinished(page);
    await lapseFolderAccess(page);
    await removeFolder(page);
    await page.reload();

    await expect(heading(page, "Open your Budget")).toBeVisible();
    await expectNoSeriousViolations();

    await button(page, "Open").click();
    await expect(
      heading(page, `We can't find your folder, ${PICKED_FOLDER}.`),
    ).toBeVisible();
    await expectNoSeriousViolations();
  });
}
