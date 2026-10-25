import { expect, type Page, test } from "@playwright/test";
import { reloadWhenSaved } from "./reload";

/** Each Category Group's name followed by its Categories' names, in order. */
async function outline(page: Page) {
  const categories = page.getByRole("region", { name: "Categories" });
  const names = await categories
    .getByRole("heading", { level: 3 })
    .allTextContents();
  return Promise.all(
    names.map(async (name) => [
      name,
      await categories
        .getByRole("region", { name, exact: true })
        .locator(".category-name")
        .allTextContents(),
    ]),
  );
}

test("a user organises Categories into Category Groups and the order is kept", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("SEK");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("0");
  await setup.getByRole("button", { name: "Add Account" }).click();

  await expect
    .poll(() => outline(page))
    .toEqual([
      ["Bills", ["Rent", "Power", "Phone", "Internet"]],
      ["Everyday", ["Groceries", "Transport", "Dining Out"]],
      ["Savings", ["Emergency Fund"]],
    ]);

  await page.getByLabel("New Category Group").fill("Fun");
  await page.getByRole("button", { name: "Add Category Group" }).click();
  await page.getByLabel("New Category in Fun").fill("Games");
  await page.getByRole("button", { name: "Add Category to Fun" }).click();

  await page.getByRole("button", { name: "Rename Phone" }).click();
  await page.getByLabel("New name for Phone").fill("Mobile");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Rename Everyday" }).click();
  await page.getByLabel("New name for Everyday").fill("Day to day");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Move Savings up" }).click();
  await page.getByRole("button", { name: "Move Internet up" }).click();
  await page.getByLabel("Category Group of Dining Out").selectOption("Fun");

  const organised = [
    ["Bills", ["Rent", "Power", "Internet", "Mobile"]],
    ["Savings", ["Emergency Fund"]],
    ["Day to day", ["Groceries", "Transport"]],
    ["Fun", ["Games", "Dining Out"]],
  ];
  await expect.poll(() => outline(page)).toEqual(organised);

  await reloadWhenSaved(page);

  await expect.poll(() => outline(page)).toEqual(organised);
});

test("a user hides, unhides and deletes Categories, and deletes an empty Category Group", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("1000");
  await setup.getByRole("button", { name: "Add Account" }).click();

  const categories = page.getByRole("region", { name: "Categories" });
  const alert = categories.getByRole("alert");
  const month = page.getByRole("table", { name: "October 2026" });
  const picker = page
    .getByRole("form", { name: "Record a Transaction" })
    .getByLabel("Category");
  const assignRent = async (amount: string) => {
    await page.getByLabel("Assignment for Rent").fill(amount);
    await page.getByLabel("Assignment for Rent").press("Enter");
  };

  // Hiding is refused while Rent still has money Available.
  await assignRent("50");
  await categories.getByRole("button", { name: "Hide Rent" }).click();
  await expect(alert).toContainText("Rent still has $50.00 Available");

  // Paying the rent spends it, and a used Category can't be deleted: the
  // refusal offers to hide it.
  const record = page.getByRole("form", { name: "Record a Transaction" });
  await record.getByLabel("Amount").fill("50");
  await record.getByLabel("Category").selectOption({ label: "Rent" });
  await record.getByRole("button", { name: "Record Transaction" }).click();
  await expect(month.getByRole("row", { name: /Rent/ })).toContainText(
    /\$50\.00.*\$0\.00/,
  );
  await categories.getByRole("button", { name: "Delete Rent" }).click();
  await expect(alert).toContainText("can't be deleted");
  await alert.getByRole("button", { name: "Hide Rent instead" }).click();
  await expect(alert).toBeHidden();

  // Internet was never used, so it can go.
  await categories.getByRole("button", { name: "Delete Internet" }).click();

  // Savings can only go once it is empty.
  await categories.getByRole("button", { name: "Delete Savings" }).click();
  await expect(alert).toContainText("Savings still has Categories");
  await categories
    .getByRole("button", { name: "Delete Emergency Fund" })
    .click();
  await categories.getByRole("button", { name: "Delete Savings" }).click();

  const expectRentHidden = async () => {
    await expect(month.getByRole("rowheader")).toHaveText([
      "Bills",
      "Power",
      "Phone",
      "Everyday",
      "Groceries",
      "Transport",
      "Dining Out",
    ]);
    await expect(picker.getByRole("option", { name: "Rent" })).toHaveCount(0);
    await expect(
      categories.getByRole("button", { name: "Unhide Rent" }),
    ).toBeVisible();
    await expect(
      categories.getByRole("heading", { name: "Savings" }),
    ).toHaveCount(0);
  };
  await expectRentHidden();

  await reloadWhenSaved(page);

  await expectRentHidden();

  await categories.getByRole("button", { name: "Unhide Rent" }).click();

  const expectRentBack = async () => {
    await expect(month.getByRole("rowheader")).toHaveText([
      "Bills",
      "Rent",
      "Power",
      "Phone",
      "Everyday",
      "Groceries",
      "Transport",
      "Dining Out",
    ]);
    await expect(picker.getByRole("option", { name: "Rent" })).toHaveCount(1);
  };
  await expectRentBack();

  await reloadWhenSaved(page);

  await expectRentBack();
});
