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
