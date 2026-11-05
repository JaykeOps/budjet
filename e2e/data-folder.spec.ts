import { expect, type Page, test } from "@playwright/test";
import { violationsInEachTheme } from "./axe";
import {
  cancelNextFolderPicker,
  deliverFile,
  fakeFolderPicker,
  filesInFolder,
  putAnotherBudgetInFolder,
} from "./folder";
import {
  addAccount,
  createBudget,
  expectCurrency,
  goTo,
  hasRail,
  openApp,
} from "./helpers";
import { folderWritesFinished, reloadWhenSaved } from "./reload";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

async function recordIdsInFolder(page: Page): Promise<string[]> {
  const lines = (await filesInFolder(page)).flatMap(({ text }) =>
    text.split("\n").filter(Boolean),
  );
  return lines.map((line) => JSON.parse(line).id);
}

test("first run asks for a folder, and a new Budget lives there and survives a reload", async ({
  page,
}) => {
  await openApp(page);
  await button(page, "Get started").click();

  const question = page.getByRole("heading", {
    name: "Where should your Budget live?",
  });
  await expect(question).toBeFocused();
  await expect(
    page.getByText(
      "Crownkeep keeps everything in that folder, and nothing goes to us.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Choose Allow when your browser asks."),
  ).toBeVisible();

  await expect(button(page, "Next")).toHaveCount(0);
  await cancelNextFolderPicker(page);
  await button(page, "Choose a folder").click();
  await expect(question).toBeVisible();

  await button(page, "Choose a folder").click();
  await button(page, "Start a new Budget").click();
  await page.getByLabel("Currency").selectOption("SEK");
  await button(page, "Next").click();
  await button(page, "Start blank").click();
  await page.getByLabel("Name").fill("Checking");
  await page.getByLabel("What it holds today").fill("250");
  await button(page, "Add Account").click();
  await button(page, "Open my Budget").click();
  await goTo(page, "Budget");
  await reloadWhenSaved(page);

  await goTo(page, "Budget");
  await expectCurrency(page, "SEK");

  const files = await filesInFolder(page);
  expect(files).toHaveLength(1);
  expect(files[0].name).toMatch(/-\d{4}-\d{2}\.jsonl$/);
  const types = files[0].text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line).type);
  expect(types[0]).toBe("BudgetCreated");
  expect(types.length).toBeGreaterThan(1);
});

test("two tabs writing at once keep every record in the folder", async ({
  page,
  context,
}) => {
  await createBudget(page);
  await folderWritesFinished(page);
  const other = await context.newPage();
  await other.goto("/");

  const addAccounts = async (tab: Page, prefix: string) => {
    for (let i = 0; i < 8; i++) {
      await addAccount(tab, { name: `${prefix} ${i}`, holds: "1" });
    }
  };
  await Promise.all([addAccounts(page, "One"), addAccounts(other, "Other")]);
  await folderWritesFinished(page);

  await other.close();
  await reloadWhenSaved(page);
  const ids = await recordIdsInFolder(page);
  expect(new Set(ids).size).toBe(ids.length);
  const localIds = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open("budjet");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const reading = opening.result
            .transaction("records")
            .objectStore("records")
            .getAllKeys();
          reading.onerror = () => reject(reading.error);
          reading.onsuccess = () => {
            opening.result.close();
            resolve(reading.result as string[]);
          };
        };
      }),
  );
  expect(ids.sort()).toEqual(localIds.sort());
});

test("another device's changes appear on opening and on regaining focus", async ({
  page,
}) => {
  await page.clock.install();
  await createBudget(page);
  await folderWritesFinished(page);

  const accountOpened = (await filesInFolder(page))
    .flatMap(({ text }) => text.split("\n").filter(Boolean))
    .map((line) => JSON.parse(line))
    .find(({ type }) => type === "AccountOpened");
  const fromLaptop = (name: string) =>
    `${JSON.stringify({
      ...accountOpened,
      id: `record-of-${name}`,
      subjectId: `account-${name}`,
      deviceId: "laptop",
      payload: { ...accountOpened.payload, name },
    })}\n`;
  // In the rail on desktop, on the Accounts tab on a phone.
  const accountRow = (name: string) =>
    page
      .getByRole("navigation", { name: "Places" })
      .getByRole("link", { name: new RegExp(`^${name}\\b`) })
      .or(
        page
          .getByRole("region", { name: "Accounts", exact: true })
          .getByRole("region", { name }),
      );

  await deliverFile(page, "any name at all", fromLaptop("Laptop savings"));
  await page.reload();
  if (!hasRail(page)) await goTo(page, "Accounts");
  await expect(accountRow("Laptop savings")).toBeVisible();

  await deliverFile(page, "another name", fromLaptop("Laptop holiday"));
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(accountRow("Laptop holiday")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an open tab reloads to give way to a newer version of the database", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");

  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => {
    indexedDB.open("budjet", 99);
  });
  await reloaded;
});

test.describe("a Budget already in browser storage", () => {
  const offer = (page: Page) =>
    page.getByRole("heading", { name: "Move your Budget into a folder" });

  /** A browser with no picker makes the Budget, then gains one, as a later version might. */
  async function aBudgetFromBeforeThePicker(page: Page) {
    await page.addInitScript(() => {
      if (!localStorage.getItem("gained-picker")) {
        Reflect.deleteProperty(window, "showDirectoryPicker");
      }
    });
    await page.goto("/");
    await button(page, "Get started").click();
    await button(page, "Next").click();
    await button(page, "Start blank").click();
    await page.getByLabel("Name").fill("Checking");
    await page.getByLabel("What it holds today").fill("250");
    await button(page, "Add Account").click();
    await button(page, "Open my Budget").click();
    await goTo(page, "Budget");
    await expect(offer(page)).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem("gained-picker", "yes"));
    await fakeFolderPicker(page);
    await reloadWhenSaved(page);
    await expect(offer(page)).toBeVisible();
  }

  test("Not now hides the offer, and it returns on the next open", async ({
    page,
  }) => {
    await aBudgetFromBeforeThePicker(page);

    await button(page, "Not now").click();
    await expect(offer(page)).toHaveCount(0);

    await page.reload();
    await expect(offer(page)).toBeVisible();
  });

  test("the offer has no accessibility violations in either theme", async ({
    page,
  }) => {
    await aBudgetFromBeforeThePicker(page);

    expect(await violationsInEachTheme(page)).toEqual({ light: [], dark: [] });
  });

  test("cancelling the picker leaves the offer as it was", async ({ page }) => {
    await aBudgetFromBeforeThePicker(page);

    await cancelNextFolderPicker(page);
    await button(page, "Choose a folder").click();

    await expect(offer(page)).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("moving copies the records, and the Budget stays in the folder after a reload", async ({
    page,
  }) => {
    await aBudgetFromBeforeThePicker(page);

    await button(page, "Choose a folder").click();
    await expect(
      page.getByText("Your Budget is now in picked-folder."),
    ).toBeVisible();
    expect((await recordIdsInFolder(page)).length).toBeGreaterThan(0);

    await button(page, "Done").click();
    await addAccount(page, { name: "Savings", holds: "1" });
    await folderWritesFinished(page);
    const copied = (await filesInFolder(page)).map(({ text }) => text).join("");
    expect(copied).toContain("Savings");

    await reloadWhenSaved(page);
    await expect(offer(page)).toHaveCount(0);
    await goTo(page, "Budget");
    await expect(
      page.getByRole("heading", { name: "Budget", exact: true }),
    ).toBeVisible();
  });

  test("a folder already holding a Budget is refused, and the offer stays", async ({
    page,
  }) => {
    await aBudgetFromBeforeThePicker(page);
    await putAnotherBudgetInFolder(page);

    await button(page, "Choose a folder").click();

    await expect(page.getByRole("alert")).toHaveText(
      "This folder already holds a Budget, so yours can't go there. Choose another folder.",
    );
    expect((await filesInFolder(page)).map(({ name }) => name)).toEqual([
      "other-device-2026-01.jsonl",
    ]);
    await page.reload();
    await expect(offer(page)).toBeVisible();
  });

  test("another open tab follows the move", async ({ page, context }) => {
    await aBudgetFromBeforeThePicker(page);
    const other = await context.newPage();
    await other.goto("/");
    await expect(offer(other)).toBeVisible();

    await button(page, "Choose a folder").click();
    await expect(
      page.getByText("Your Budget is now in picked-folder."),
    ).toBeVisible();

    await expect(offer(other)).toHaveCount(0);
  });
});
