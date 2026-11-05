import { expect, type Locator, type Page } from "@playwright/test";
import { fakeFolderPicker } from "./folder";

type FirstAccount = {
  name?: string;
  type?: string;
  openingBalance?: string;
};

type Place = "Budget" | "Activity" | "Accounts";

/**
 * Opens the app unless this test already has, with a folder picker that can't
 * open a dialog. Before a Budget exists the app is only setup, so there is no
 * place to `goTo`.
 */
export async function openApp(page: Page): Promise<void> {
  if (page.url() === "about:blank") {
    await fakeFolderPicker(page);
    await page.goto("/");
  }
}

/**
 * Creates a Budget by walking first run: every spec's way through setup. Any
 * change to the setup steps belongs here, not in the specs.
 */
export async function createBudget(
  page: Page,
  {
    currency = "USD",
    categories = "Use the starter set",
    firstAccount: { name = "Checking", type, openingBalance = "1000" } = {},
  }: {
    currency?: string;
    categories?: "Use the starter set" | "Start blank";
    firstAccount?: FirstAccount;
  } = {},
): Promise<void> {
  await openApp(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await page.getByLabel("Currency").selectOption(currency);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: categories }).click();
  await page.getByLabel("Name").fill(name);
  if (type) {
    await page.getByRole("radio", { name: type }).check();
  }
  await page.getByLabel("What it holds today").fill(openingBalance);
  await page.getByRole("button", { name: "Add Account" }).click();
  await page.getByRole("button", { name: "Open my Budget" }).click();
}

/** Activity on a phone and All Accounts on desktop, which are one screen. */
export function activity(page: Page) {
  return page.getByRole("region", { name: /^(Activity|All Accounts)$/ });
}

/** Narrows Activity through its one "Showing" button, whose button then says how many entries. */
export async function show(
  page: Page,
  { account, month }: { account?: string; month?: string },
  entries?: string,
): Promise<void> {
  await page.getByRole("button", { name: /^Showing:/ }).click();
  const picker = page.getByRole("dialog", { name: "Show" });
  if (account) await picker.getByRole("radio", { name: account }).check();
  if (month) await picker.getByRole("radio", { name: month }).check();
  await picker
    .getByRole("button", { name: entries ?? /^Show \d+ entr/ })
    .click();
  await expect(picker).toBeHidden();
}

/**
 * Reaches a place through whichever navigation this device has: tabs on a
 * phone, the rail on desktop. Only a phone has an Accounts tab; `openAccount`
 * and `addAccount` work on both.
 */
export async function goTo(page: Page, place: Place): Promise<void> {
  const places = page.getByRole("navigation", { name: "Places" });
  const links = {
    Budget: places.getByRole("link", { name: "Budget", exact: true }),
    Activity: places.getByRole("link", { name: /^(Activity|All Accounts)/ }),
    Accounts: places.getByRole("link", { name: "Accounts", exact: true }),
  };
  const landmarks = {
    Budget: page.getByRole("heading", { name: "Budget", exact: true }),
    Activity: activity(page),
    Accounts: page.getByRole("region", { name: "Accounts", exact: true }),
  };
  await links[place].click();
  await expect(landmarks[place]).toBeVisible();
}

/** Whether the rail shows rather than the tabs, at the width the CSS switches them. */
export function hasRail(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 720;
}

/** Opens an Account's page: from the rail on desktop, drilling in from the Accounts tab on a phone. */
export async function openAccount(page: Page, name: string): Promise<void> {
  const named = new RegExp(`^${name}\\b`);
  if (hasRail(page)) {
    const places = page.getByRole("navigation", { name: "Places" });
    const closed = places.getByRole("button", { name: /^Closed \(/ });
    if (
      (await closed.isVisible()) &&
      (await closed.getAttribute("aria-expanded")) === "false"
    ) {
      await closed.click();
    }
    await places.getByRole("link", { name: named }).click();
  } else {
    await goTo(page, "Accounts");
    const account = page.getByRole("button", { name: named });
    if (!(await account.isVisible())) {
      await page.getByText(/^Closed Accounts/).click();
    }
    await account.click();
  }
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The balance on the page of the Account open now, where its name is its heading. */
export function balanceOf(page: Page, name: string): Locator {
  return page.getByRole("status", { name: `Balance of ${name}` });
}

/** Opens an Account's page and checks what it holds. */
export async function expectBalance(
  page: Page,
  name: string,
  amount: string,
): Promise<void> {
  await openAccount(page, name);
  await expect(balanceOf(page, name)).toContainText(amount);
}

/** Opens Add Account: from the rail on desktop, the Accounts tab on a phone. */
export async function startAddingAccount(page: Page): Promise<Locator> {
  if (hasRail(page)) {
    await page.getByRole("button", { name: "+ Add Account" }).click();
  } else {
    await goTo(page, "Accounts");
    await page.getByRole("button", { name: "Add Account" }).click();
  }
  return page.getByRole("dialog", { name: "Add Account" });
}

/** Adds an Account through its sheet, which then shows the new Account's page. */
export async function addAccount(
  page: Page,
  { name, kind, holds }: { name: string; kind?: string; holds?: string },
): Promise<void> {
  const sheet = await startAddingAccount(page);
  await sheet.getByLabel("Name").fill(name);
  if (kind) await sheet.getByRole("radio", { name: kind }).check();
  if (holds) await sheet.getByLabel("What it holds today").fill(holds);
  await sheet.getByRole("button", { name: "Add Account" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Moves money from an Account's page, through the Transfer sheet. */
export async function transfer(
  page: Page,
  { from, to, amount }: { from: string; to: string; amount: string },
): Promise<void> {
  await openAccount(page, from);
  await page.getByRole("button", { name: "Transfer money" }).click();
  const sheet = page.getByRole("dialog", { name: "Transfer money" });
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByLabel("To").selectOption({ label: to });
  await sheet.getByRole("button", { name: /^Transfer/ }).click();
  await expect(sheet).toBeHidden();
}

/** The toast showing now. */
export function toast(page: Page): Locator {
  return page.getByRole("status", { name: "Notification" });
}

/** A Category's or Category Group's row on the Budget: a list item on a phone, a table row on desktop. */
export function budgetRow(page: Page, name: string): Locator {
  return page
    .getByRole("listitem", { name, exact: true })
    .or(page.getByRole("row", { name: new RegExp(`^${name}\\b`) }));
}

/** The Budget's Category Groups and Categories, in the order they show, in one flat list. */
export function budgetOutline(page: Page): Promise<(string | null)[]> {
  return page
    .getByRole("region", { name: /^\w+ \d{4}$/ })
    .getByRole("heading", { level: 3 })
    .or(page.getByRole("meter"))
    .evaluateAll((found) =>
      found.map(
        (element) =>
          element.getAttribute("aria-label")?.replace("Spending in ", "") ??
          element.textContent,
      ),
    );
}

type TransactionEntry = {
  date?: string;
  amount: string;
  /** Without one, money in goes to Ready to Assign. */
  category?: string;
  money?: "in" | "out";
  payee?: string;
  account?: string;
};

/** The steps of recording on a phone, from How much? on. */
export async function startRecording(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("menuitem", { name: "Record a Transaction" }).click();
  return page.getByRole("dialog", { name: "How much?" });
}

/** The Category step, named for the direction of the money. */
export function categoryStep(page: Page): Locator {
  return page.getByRole("dialog", {
    name: /^(What was it for|Where does it go)\?$/,
  });
}

/** A choice on the Category step, whose name starts with the Category's. */
export function categoryChoice(page: Page, name: string): Locator {
  return categoryStep(page).getByRole("button", {
    name: new RegExp(`^${name}\\b`),
  });
}

/** The last step of recording on a phone. */
export function reviewStep(page: Page): Locator {
  return page.getByRole("dialog", { name: "Anything else?" });
}

/** Chooses an Account in a select whose options also show its balance. */
async function chooseAccount(field: Locator, name: string): Promise<void> {
  await field.selectOption(
    (await field
      .locator("option", { hasText: name })
      .getAttribute("value")) as string,
  );
}

/** Records a Transaction from where the user is: through (+) on a phone, Activity's form on desktop. */
export async function enterTransaction(
  page: Page,
  { date, amount, category, money = "out", payee, account }: TransactionEntry,
): Promise<void> {
  if (hasRail(page)) {
    const form = page.getByRole("form", { name: "Record a Transaction" });
    if (date) await form.getByLabel("Date").fill(date);
    if (account) {
      await form.getByLabel("Account").selectOption({ label: account });
    }
    await form.getByLabel("Money").selectOption(money);
    await form.getByLabel("Amount").fill(amount);
    if (category) {
      await form.getByLabel("Category").selectOption({ label: category });
    }
    if (payee) await form.getByLabel("Payee").fill(payee);
    await form.getByRole("button", { name: "Record Transaction" }).click();
    return;
  }
  const first = await startRecording(page);
  if (money === "in")
    await first.getByRole("radio", { name: "Money in" }).check();
  await first.getByLabel("Amount").fill(amount);
  await first.getByRole("button", { name: "Next" }).click();
  await categoryChoice(page, category ?? "Ready to Assign").click();
  const review = reviewStep(page);
  if (payee) await review.getByLabel("Payee").fill(payee);
  if (date) await review.getByLabel("Another day").fill(date);
  if (account) await chooseAccount(review.getByLabel("Account"), account);
  await review.getByRole("button", { name: "Record", exact: true }).click();
  await expect(review).toBeHidden();
}

/** Records a Transaction and comes back to the Budget. */
export async function record(
  page: Page,
  entry: TransactionEntry,
): Promise<void> {
  await goTo(page, "Activity");
  await enterTransaction(page, entry);
  await goTo(page, "Budget");
}

/** Checks whether recording money out offers a Category. */
export async function expectCategoryOffered(
  page: Page,
  name: string,
  offered: boolean,
): Promise<void> {
  const count = offered ? 1 : 0;
  if (hasRail(page)) {
    await expect(
      page
        .getByRole("form", { name: "Record a Transaction" })
        .getByLabel("Category")
        .getByRole("option", { name }),
    ).toHaveCount(count);
    return;
  }
  const first = await startRecording(page);
  await first.getByLabel("Amount").fill("1");
  await first.getByRole("button", { name: "Next" }).click();
  await expect(categoryChoice(page, name)).toHaveCount(count);
  await categoryStep(page).getByRole("button", { name: "Close" }).click();
}

/** Whether this device has the desktop table, which is typed into directly. */
function hasAssignedColumn(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1180;
}

/** The Category sheet, however it was opened. */
export function categorySheet(page: Page): Locator {
  return page.getByRole("dialog", { name: /^(Categories|Assign )/ });
}

/** Opens the Category sheet at a Category, by its name in its row. */
export async function openCategory(
  page: Page,
  category: string,
): Promise<Locator> {
  await budgetRow(page, category)
    .getByRole("button", { name: category, exact: true })
    .click();
  return categorySheet(page);
}

/** Leaves the sheet, unless saving on the last Category has already closed it. */
async function closeSheet(sheet: Locator): Promise<void> {
  const close = sheet.getByRole("button", { name: "Close" });
  if (await close.isVisible()) await close.click();
}

/** Gives a Category an Assignment in the Month showing. */
export async function assign(
  page: Page,
  category: string,
  amount: string,
): Promise<void> {
  if (hasAssignedColumn(page)) {
    const field = page.getByLabel(`Assignment for ${category}`);
    await field.fill(amount);
    await field.press("Enter");
    return;
  }
  const sheet = await openCategory(page, category);
  // An Overspent Category can open on Another Category.
  await sheet
    .getByRole("button", { name: "Ready to Assign", exact: true })
    .click();
  const field = sheet.getByRole("textbox", { name: /^Assigned in / });
  await field.fill(amount);
  await field.press("Enter");
  await closeSheet(sheet);
}

/**
 * Opens Copy last Month's preview: the header's button on desktop, the Assign
 * walk's opening offer on a phone. Returns the sheet holding it.
 */
export async function openCopyPreview(page: Page): Promise<Locator> {
  const open = hasAssignedColumn(page)
    ? page.getByRole("button", { name: "Copy last Month" })
    : page.getByRole("button", { name: "Assign", exact: true });
  await open.click();
  return page.getByRole("dialog", { name: /^(Copy|Assign) / });
}

/** Copies everything Copy last Month offers and leaves the sheet. */
export async function copyLastMonth(page: Page): Promise<void> {
  const sheet = await openCopyPreview(page);
  await sheet.getByRole("button", { name: /^Copy \d+ Assignments?$/ }).click();
  await closeSheet(sheet);
}

/** Checks a Category's Assignment in the Month showing, written like "$1,100.00". */
export async function expectAssigned(
  page: Page,
  category: string,
  amount: string,
): Promise<void> {
  if (hasAssignedColumn(page)) {
    await expect(page.getByLabel(`Assignment for ${category}`)).toHaveValue(
      amount.replace(/[$,]/g, ""),
    );
    return;
  }
  const sheet = await openCategory(page, category);
  await expect(sheet).toContainText(
    new RegExp(`Assigned in \\w+\\s*\\+ ${amount.replace(/[$.]/g, "\\$&")}`),
  );
  await closeSheet(sheet);
}
