import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  assign,
  budgetRow,
  createBudget,
  enterTransaction,
  expectBalance,
  goTo,
  show,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

test("a user records spending and income and sees Available, Ready to Assign and the Account balance change", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Groceries", "400");

  await goTo(page, "Activity");
  await enterTransaction(page, {
    amount: "45.50",
    category: "Groceries",
    payee: "Corner Shop",
  });
  await enterTransaction(page, {
    date: "2026-10-01",
    money: "in",
    amount: "2000",
    payee: "Employer",
  });

  const expectRecorded = async () => {
    await goTo(page, "Budget");
    const groceries = budgetRow(page, "Groceries");
    await expect(groceries).toContainText("$45.50");
    await expect(groceries).toContainText("$354.50");
    await expect(
      page.getByRole("status", { name: "Ready to Assign" }),
    ).toHaveText(/\$2,600\.00/);
    await expectBalance(page, "Checking", "$2,954.50");

    await goTo(page, "Activity");
    const rows = page
      .getByRole("table", { name: "History of All Accounts" })
      .getByRole("row");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(
      "$3,000.00 in, $45.50 out, ended at $2,954.50",
    );
    await expect(rows.nth(1)).toContainText(
      /Corner Shop.*Groceries, Checking.*−\$45\.50/,
    );
    await expect(rows.nth(2)).toContainText(/Opening Balance.*\+\$1,000\.00/);
    await expect(rows.nth(3)).toContainText(
      /Employer.*Ready to Assign, Checking.*\+\$2,000\.00/,
    );
  };
  await expectRecorded();

  await reloadWhenSaved(page);

  await expectRecorded();
});

test("a user edits and deletes Transactions and Available, Ready to Assign and the Account balance follow", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Groceries", "400");
  await goTo(page, "Activity");
  await enterTransaction(page, {
    amount: "45.50",
    category: "Groceries",
    payee: "Corner Shop",
  });
  await enterTransaction(page, {
    date: "2026-10-01",
    money: "in",
    amount: "2000",
    payee: "Employer",
  });
  const transactions = page.getByRole("table", {
    name: "History of All Accounts",
  });

  await transactions
    .getByRole("row", { name: /Corner Shop/ })
    .getByRole("button", { name: /^More/ })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: "Edit Transaction" });
  await expect(edit.getByLabel("Date")).toHaveValue("2026-10-15");
  await expect(edit.getByLabel("Amount")).toHaveValue("45.50");
  await expect(edit.getByLabel("Payee")).toHaveValue("Corner Shop");
  await edit.getByLabel("Amount").fill("60");
  await edit.getByLabel("Payee").fill("Corner Store");
  await edit.getByRole("button", { name: "Save Transaction" }).click();
  await expect(edit).toHaveCount(0);
  await transactions
    .getByRole("row", { name: /Employer/ })
    .getByRole("button", { name: /^More/ })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const expectChanged = async () => {
    await goTo(page, "Budget");
    await expect(budgetRow(page, "Groceries")).toContainText("$340.00");
    await expect(
      page.getByRole("status", { name: "Ready to Assign" }),
    ).toHaveText(/\$600\.00/);
    await expectBalance(page, "Checking", "$940.00");
    await goTo(page, "Activity");
    await expect(transactions.getByRole("row")).toHaveCount(3);
    await expect(transactions.getByRole("row").nth(1)).toContainText(
      /Corner Store.*Groceries.*−\$60\.00/,
    );
  };
  await expectChanged();

  await reloadWhenSaved(page);

  await expectChanged();
});

test("what's showing stays after a reload and Back returns to what showed before", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await goTo(page, "Activity");
  const all = page.getByRole("table", { name: "History of All Accounts" });
  const savings = page.getByRole("table", { name: "History of Savings" });
  await expect(all).toBeVisible();

  await show(page, { account: "Savings" }, "Show 1 entry");
  await expect(savings).toBeVisible();
  await expect(page).toHaveURL(/account=/);

  await reloadWhenSaved(page);
  await expect(savings).toBeVisible();

  await page.goBack();
  await expect(all).toBeVisible();
});

test("an Account with thousands of Transactions renders only the rows in view", async ({
  page,
}) => {
  await createBudget(page);
  await seedTransactions(page, 3000);
  await reloadWhenSaved(page);
  await goTo(page, "Activity");

  const history = page.getByRole("table", { name: "History of All Accounts" });
  // The Month's heading, the Opening Balance and the Transactions.
  await expect(history).toHaveAttribute("aria-rowcount", "3002");
  await expect(history.getByRole("row", { name: /Payee 2999/ })).toBeVisible();
  expect(await history.getByRole("row").count()).toBeLessThan(100);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect(history.getByRole("row", { name: /Payee 0 / })).toBeVisible();
  expect(await history.getByRole("row").count()).toBeLessThan(100);
});

/**
 * Writes Transactions in Checking straight into browser storage, all in the
 * Budget's Month, so that nothing is folded away. "Payee 0" is the oldest.
 */
async function seedTransactions(page: Page, count: number) {
  await page.evaluate(async (count) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("budjet");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<string[]>((resolve, reject) => {
      const request = database
        .transaction("records")
        .objectStore("records")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = stored.map((payload) => JSON.parse(payload));
    const account = records.find(({ type }) => type === "AccountOpened");
    const newest = Math.max(
      ...records.map(({ timestamp }) => timestamp.wallTime),
    );
    const store = database
      .transaction("records", "readwrite")
      .objectStore("records");
    for (let index = 0; index < count; index++) {
      const record = {
        id: crypto.randomUUID(),
        subjectId: crypto.randomUUID(),
        deviceId: "seed",
        timestamp: { wallTime: newest + 1 + index, counter: 0 },
        type: "TransactionRecorded",
        payload: {
          version: 1,
          accountId: account.subjectId,
          date: "2026-10-01",
          amount: { minorUnits: 100, currency: "USD" },
          payee: `Payee ${index}`,
        },
      };
      store.put(JSON.stringify(record), record.id);
    }
    await new Promise((resolve) => {
      store.transaction.oncomplete = resolve;
    });
  }, count);
}
