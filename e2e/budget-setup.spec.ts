import { expect, type Page, test } from "@playwright/test";
import { reloadWhenSaved } from "./reload";

async function addFirstAccount(page: Page, openingBalance: string) {
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill(openingBalance);
  await setup.getByRole("button", { name: "Add Account" }).click();
}

test("a first-time user creates a Budget in their currency and adds their first Account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeVisible();

  await page.getByLabel("Currency").selectOption("SEK");
  await page.getByRole("button", { name: "Create Budget" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();

  await addFirstAccount(page, "1500");

  const expectBudget = async () => {
    await expect(
      page.getByRole("heading", { name: "Budget", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Kept in SEK")).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: "Accounts" })
        .getByRole("row", { name: /Checking/ }),
    ).toContainText("1,500.00");
    await expect(
      page.getByRole("heading", { name: "Add your first Account" }),
    ).toBeHidden();
  };
  await expectBudget();

  await reloadWhenSaved(page);

  await expectBudget();
});

test("setup resumes at the first Account after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  await expect(
    page.getByRole("heading", { name: "Add your first Account" }),
  ).toBeVisible();

  await reloadWhenSaved(page);

  await expect(
    page.getByRole("heading", { name: "Add your first Account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();
});

test("a returning user's Budget opens with the network offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByRole("button", { name: "Create Budget" }).click();
  await addFirstAccount(page, "200");
  await expect(page.getByText("Kept in EUR")).toBeVisible();

  await context.setOffline(true);
  await reloadWhenSaved(page);

  await expect(page.getByText("Kept in EUR")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();
});

test("changes made after a reload come from the same device", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("SEK");
  await page.getByRole("button", { name: "Create Budget" }).click();
  await expect(
    page.getByRole("heading", { name: "Add your first Account" }),
  ).toBeVisible();

  await reloadWhenSaved(page);
  await addFirstAccount(page, "100");
  await expect(page.getByText("Kept in SEK")).toBeVisible();
  await reloadWhenSaved(page);

  const deviceIds = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open("budjet");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const reading = database
            .transaction("records")
            .objectStore("records")
            .getAll();
          reading.onerror = () => reject(reading.error);
          reading.onsuccess = () => {
            database.close();
            resolve(
              reading.result.map(
                (payload: string) => JSON.parse(payload).deviceId,
              ),
            );
          };
        };
      }),
  );
  expect(deviceIds.length).toBeGreaterThan(1);
  expect(new Set(deviceIds).size).toBe(1);
});
