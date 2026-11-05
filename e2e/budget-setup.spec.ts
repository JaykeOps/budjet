import { expect, type Page, test } from "@playwright/test";
import {
  addAccount as addAnotherAccount,
  createBudget,
  expectBalance,
  goTo,
  openAccount,
  openApp,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

const welcome = (page: Page) =>
  page.getByRole("heading", { name: "Give every dollar a job." });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** Every record in browser storage. */
function storedRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ type: string; deviceId: string }[]>((resolve, reject) => {
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
            resolve(reading.result.map((row: string) => JSON.parse(row)));
          };
        };
      }),
  );
}

/** This browser's own picker never counts: the page opens without one. */
async function withoutAFolderPicker(page: Page) {
  await page.addInitScript(() =>
    Reflect.deleteProperty(window, "showDirectoryPicker"),
  );
  await page.goto("/");
}

async function walkToAccounts(page: Page, currency = "USD") {
  await openApp(page);
  await button(page, "Get started").click();
  await button(page, "Choose a folder").click();
  await button(page, "Start a new Budget").click();
  await page.getByLabel("Currency").selectOption(currency);
  await button(page, "Next").click();
  await button(page, "Use the starter set").click();
}

async function addAccount(page: Page, name: string, holds: string) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("What it holds today").fill(holds);
  await button(page, "Add Account").click();
}

async function addAccountAfter(page: Page, name: string, holds: string) {
  await button(page, "Add another Account").click();
  await addAccount(page, name, holds);
}

test("a new user answers one question per screen and opens their Budget", async ({
  page,
}) => {
  await openApp(page);
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(button(page, "Back")).toBeHidden();
  await button(page, "Get started").click();

  await expect(
    page.getByRole("heading", { name: "Where should your Budget live?" }),
  ).toBeFocused();
  await expect(page.getByText("1 of 4")).toBeVisible();
  await button(page, "Choose a folder").click();
  await button(page, "Start a new Budget").click();

  await expect(
    page.getByRole("heading", { name: "What currency is your Budget in?" }),
  ).toBeFocused();
  await expect(page.getByText("2 of 4")).toBeVisible();
  await expect(page.getByText("you can't change it later")).toBeVisible();
  await page.getByLabel("Currency").selectOption("SEK");
  await button(page, "Next").click();

  await expect(
    page.getByRole("heading", { name: "Start with some Categories?" }),
  ).toBeVisible();
  await expect(page.getByText("3 of 4")).toBeVisible();
  await button(page, "Use the starter set").click();

  await expect(
    page.getByRole("heading", { name: "Where's your money now?" }),
  ).toBeVisible();
  await expect(page.getByText("4 of 4")).toBeVisible();

  // At least one Account is required, and it needs a name.
  await expect(button(page, "Open my Budget")).toBeHidden();
  await button(page, "Add Account").click();
  await expect(button(page, "Open my Budget")).toBeHidden();

  await addAccount(page, "Checking", "1500");
  await expect(
    page.getByText(/1,500\.00 goes to Ready to Assign/),
  ).toBeVisible();

  await button(page, "Add another Account").click();
  await page.getByRole("radio", { name: "Savings" }).check();
  await addAccount(page, "Rainy day", "6000");
  await expect(
    page.getByText(/7,500\.00 goes to Ready to Assign/),
  ).toBeVisible();

  // A blank amount is $0.00.
  await button(page, "Add another Account").click();
  await addAccount(page, "Wallet", "");
  await expect(
    page.getByText(/7,500\.00 goes to Ready to Assign/),
  ).toBeVisible();

  await button(page, "Remove Wallet").click();
  await button(page, "Remove Rainy day").click();
  await expect(
    page.getByText(/1,500\.00 goes to Ready to Assign/),
  ).toBeVisible();
  await button(page, "Add another Account").click();
  await page.getByRole("radio", { name: "Savings" }).check();
  await addAccount(page, "Rainy day", "6000");

  await button(page, "Open my Budget").click();

  const expectBudget = async () => {
    await goTo(page, "Budget");
    await expect(page.getByText("Kept in SEK")).toBeVisible();
    await expect(page.getByText("Rent")).not.toHaveCount(0);
    await expectBalance(page, "Checking", "1,500.00");
    await openAccount(page, "Rainy day");
    await expect(page.getByText(/^Savings$/)).toBeVisible();
  };
  await expectBudget();

  await reloadWhenSaved(page);

  await expectBudget();
  await expect(welcome(page)).toBeHidden();
});

test("Back keeps every answer and can change any of them, including the currency", async ({
  page,
}) => {
  await walkToAccounts(page);
  await addAccount(page, "Checking", "1000");

  await button(page, "Back").click();
  await expect(button(page, "Use the starter set")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await button(page, "Back").click();
  await expect(page.getByLabel("Currency")).toHaveValue("USD");
  await page.getByLabel("Currency").selectOption("SEK");
  await button(page, "Next").click();
  await button(page, "Start blank").click();

  await expect(button(page, "Remove Checking")).toBeVisible();
  await button(page, "Open my Budget").click();

  await goTo(page, "Budget");
  await expect(page.getByText("Kept in SEK")).toBeVisible();
  await expect(page.getByText("Rent")).toHaveCount(0);
  await expectBalance(page, "Checking", "1,000.00");
});

test("an amount the new currency can't hold has to be fixed before opening", async ({
  page,
}) => {
  await walkToAccounts(page);
  await addAccount(page, "Checking", "10.50");
  await addAccountAfter(page, "Cash", "20");

  await button(page, "Back").click();
  await button(page, "Back").click();
  await page.getByLabel("Currency").selectOption("JPY");
  await button(page, "Next").click();
  await button(page, "Use the starter set").click();

  await expect(page.getByText('"10.50" isn\'t an amount in JPY')).toBeVisible();
  await expect(button(page, "Open my Budget")).toBeDisabled();
  expect(await storedRecords(page)).toEqual([]);

  await button(page, "Remove Checking").click();
  await button(page, "Open my Budget").click();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in JPY")).toBeVisible();
});

test("reloading mid-setup starts over and saves nothing", async ({ page }) => {
  await walkToAccounts(page, "SEK");
  await addAccount(page, "Checking", "1000");
  expect(await storedRecords(page)).toEqual([]);

  await reloadWhenSaved(page);

  await expect(welcome(page)).toBeVisible();
  expect(await storedRecords(page)).toEqual([]);
});

test.describe("with a Swedish browser", () => {
  test.use({ locale: "sv-SE" });

  test("the currency starts from the locale", async ({ page }) => {
    await openApp(page);
    await button(page, "Get started").click();
    await button(page, "Choose a folder").click();
    await button(page, "Start a new Budget").click();
    await expect(page.getByLabel("Currency")).toHaveValue("SEK");
  });
});

test.describe("where the browser can't pick a folder", () => {
  const honestWording =
    "Your Budget stays in this browser, on this device. Clearing this browser's data erases it. This browser can't keep your Budget in a folder, so it can't sync to your other devices.";

  test("Welcome says what that means", async ({ page }) => {
    await withoutAFolderPicker(page);
    await expect(page.getByText(honestWording)).toBeVisible();
  });

  test("first run has no Data Folder step, and the Budget stays in this browser", async ({
    page,
  }) => {
    await withoutAFolderPicker(page);
    await button(page, "Get started").click();

    await expect(page.getByText("1 of 3")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What currency is your Budget in?" }),
    ).toBeVisible();
    await button(page, "Next").click();
    await button(page, "Start blank").click();
    await addAccount(page, "Checking", "100");
    await button(page, "Open my Budget").click();
    await goTo(page, "Budget");

    await reloadWhenSaved(page);

    await goTo(page, "Budget");
    await expect(welcome(page)).toBeHidden();
  });

  test("Welcome doesn't say it where the browser can", async ({ page }) => {
    await openApp(page);
    await expect(welcome(page)).toBeVisible();
    await expect(page.getByText(honestWording)).toBeHidden();
  });
});

test.describe("on an iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("Welcome offers the Home Screen hint", async ({ page }) => {
    await openApp(page);
    await expect(page.getByText(/your Home Screen/)).toBeVisible();
  });
});

test("elsewhere Welcome has no Home Screen hint", async ({ page }) => {
  await openApp(page);
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByText(/your Home Screen/)).toBeHidden();
});

test("persistent storage is requested once there's a Budget to keep", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("persist requests", "0");
    navigator.storage.persist = async () => {
      const requests = Number(sessionStorage.getItem("persist requests"));
      sessionStorage.setItem("persist requests", String(requests + 1));
      return true;
    };
  });
  const requests = () =>
    page.evaluate(() => Number(sessionStorage.getItem("persist requests")));

  await walkToAccounts(page);
  expect(await requests()).toBe(0);
  await addAccount(page, "Checking", "1");
  await button(page, "Open my Budget").click();
  await goTo(page, "Budget");
  await expect.poll(requests).toBeGreaterThan(0);

  await reloadWhenSaved(page);
  await goTo(page, "Budget");
  await expect.poll(requests).toBeGreaterThan(0);
});

test("a Budget that an older setup left without an Account still asks for one", async ({
  page,
}) => {
  await openApp(page);
  await expect(welcome(page)).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("budjet");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const writing = database.transaction("records", "readwrite");
          const record = {
            id: crypto.randomUUID(),
            subjectId: crypto.randomUUID(),
            deviceId: "older-setup",
            timestamp: { wallTime: Date.now(), counter: 0 },
            type: "BudgetCreated",
            payload: { version: 1, currency: "SEK" },
          };
          writing.objectStore("records").put(JSON.stringify(record), record.id);
          writing.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
  );

  await page.reload();

  const add = page.getByRole("form", { name: "Add your first Account" });
  await expect(add).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await add.getByLabel("Name").fill("Checking");
  await add.getByLabel("What it holds today").fill("100");
  await add.getByRole("button", { name: "Add Account" }).click();
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in SEK")).toBeVisible();
});

test("a returning user's Budget opens with the network offline", async ({
  page,
  context,
}) => {
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createBudget(page, {
    currency: "EUR",
    firstAccount: { openingBalance: "200" },
  });
  await goTo(page, "Budget");
  await expect(page.getByText("Kept in EUR")).toBeVisible();

  await context.setOffline(true);
  await reloadWhenSaved(page);

  await goTo(page, "Budget");
  await expect(page.getByText("Kept in EUR")).toBeVisible();
  await expect(welcome(page)).toBeHidden();
});

test("changes made after a reload come from the same device", async ({
  page,
}) => {
  await createBudget(page, { currency: "SEK" });
  await goTo(page, "Budget");
  await reloadWhenSaved(page);

  await addAnotherAccount(page, { name: "Savings", holds: "100" });
  await reloadWhenSaved(page);

  const deviceIds = (await storedRecords(page)).map(({ deviceId }) => deviceId);
  expect(deviceIds.length).toBeGreaterThan(1);
  expect(new Set(deviceIds).size).toBe(1);
});
