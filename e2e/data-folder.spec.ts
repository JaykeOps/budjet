import { expect, type Page, test } from "@playwright/test";
import { cancelNextFolderPicker, filesInFolder } from "./folder";
import { addAccount, createBudget, goTo, openApp } from "./helpers";
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
  await expect(page.getByText("Kept in SEK")).toBeVisible();

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
