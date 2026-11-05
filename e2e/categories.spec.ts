import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  assign,
  budgetOutline,
  createBudget,
  editorOutline,
  expectCategoryOffered,
  finishEditing,
  goTo,
  openMore,
  record,
  startEditing,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

const button = (scope: Page | Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

const nameField = (page: Page, name: string) =>
  page.getByRole("textbox", { name: `Name of ${name}`, exact: true });

const starter = [
  "Bills",
  "Rent",
  "Power",
  "Phone",
  "Internet",
  "Everyday",
  "Groceries",
  "Transport",
  "Dining Out",
  "Savings",
  "Emergency Fund",
];

async function editing(page: Page) {
  await createBudget(page);
  await goTo(page, "Budget");
  await startEditing(page);
}

test("Edit and Done turn the Budget into its list and back, and a reload stays", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");

  await startEditing(page);
  await expect.poll(() => editorOutline(page)).toEqual(starter);
  await expect(page.getByRole("meter")).toHaveCount(0);

  await reloadWhenSaved(page);
  await expect.poll(() => editorOutline(page)).toEqual(starter);

  await finishEditing(page);
  await expect(page.getByRole("meter").first()).toBeVisible();
});

test("going to another place ends Edit", async ({ page }) => {
  await editing(page);

  await goTo(page, "Activity");
  await goTo(page, "Budget");

  await expect(button(page, "Edit")).toBeVisible();
});

test("a blank Budget gets its first Category through Edit", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await startEditing(page);

  await button(page, "Add a Category Group").click();
  const groupField = page.getByRole("textbox", {
    name: "Add a Category Group",
  });
  await groupField.fill("Bills");
  await groupField.press("Enter");
  await groupField.blur();
  await button(page, "Add a Category to Bills").click();
  await page
    .getByRole("textbox", { name: "Add a Category to Bills" })
    .fill("Rent");
  await finishEditing(page);

  await expect.poll(() => budgetOutline(page)).toEqual(["Bills", "Rent"]);
});

test("adding stays open after Enter, and leaving saves what's typed", async ({
  page,
}) => {
  await editing(page);

  await button(page, "Add a Category to Savings").click();
  const field = page.getByRole("textbox", {
    name: "Add a Category to Savings",
  });
  await expect(field).toBeFocused();
  await field.fill("Holiday");
  await field.press("Enter");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  await expect(toast(page)).toContainText("Added Holiday");
  await field.fill("  Car  ");
  await field.press("Enter");

  await field.fill("Boat");
  await field.blur();
  await expect(field).toBeHidden();

  // A blank one adds nothing.
  await button(page, "Add a Category to Savings").click();
  await field.fill("   ");
  await field.press("Enter");
  await field.blur();

  const added = [...starter, "Holiday", "Car", "Boat"];
  await expect.poll(() => editorOutline(page)).toEqual(added);

  await reloadWhenSaved(page);
  await expect.poll(() => editorOutline(page)).toEqual(added);
});

test("Undo takes back what was just added", async ({ page }) => {
  await editing(page);

  await button(page, "Add a Category Group").click();
  const field = page.getByRole("textbox", { name: "Add a Category Group" });
  await field.fill("Fun");
  await field.press("Enter");
  await expect.poll(() => editorOutline(page)).toEqual([...starter, "Fun"]);

  await button(toast(page), "Undo").click();

  await expect.poll(() => editorOutline(page)).toEqual(starter);
});

test("renaming saves on Enter or leaving, and a blank name reverts", async ({
  page,
}) => {
  await editing(page);

  const phone = nameField(page, "Phone");
  await phone.fill("Mobile");
  await phone.press("Enter");
  await expect(toast(page)).toContainText("Renamed to Mobile");
  await expect(nameField(page, "Mobile")).toBeFocused();

  await nameField(page, "Everyday").fill("Day to day");
  await nameField(page, "Everyday").blur();
  await expect(toast(page)).toContainText("Renamed to Day to day");

  await nameField(page, "Rent").fill("   ");
  await nameField(page, "Rent").blur();
  await expect(nameField(page, "Rent")).toHaveValue("Rent");

  await nameField(page, "Power").fill("");
  await nameField(page, "Power").press("Enter");
  await expect(nameField(page, "Power")).toHaveValue("Power");

  const renamed = starter.map((name) => {
    if (name === "Phone") return "Mobile";
    return name === "Everyday" ? "Day to day" : name;
  });
  await expect.poll(() => editorOutline(page)).toEqual(renamed);

  await reloadWhenSaved(page);
  await expect.poll(() => editorOutline(page)).toEqual(renamed);

  await nameField(page, "Mobile").fill("Phone");
  await nameField(page, "Mobile").press("Enter");
  await button(toast(page), "Undo").click();
  await expect(nameField(page, "Mobile")).toHaveValue("Mobile");
});

test("a never-used Category deletes with Undo, back in its place", async ({
  page,
}) => {
  await editing(page);

  const sheet = await openMore(page, "Power");
  await button(sheet, "Delete Power").click();

  await expect(toast(page)).toContainText("Deleted Power");
  await expect
    .poll(() => editorOutline(page))
    .toEqual(starter.filter((name) => name !== "Power"));

  await button(toast(page), "Undo").click();
  await expect.poll(() => editorOutline(page)).toEqual(starter);
});

test("a used Category explains why it can't be deleted and offers hiding", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Rent", "50");
  await record(page, { amount: "50", category: "Rent" });
  await goTo(page, "Budget");
  await startEditing(page);

  const sheet = await openMore(page, "Rent");
  await expect(sheet).toContainText(
    "Rent can't be deleted, because it has Transactions or Assignments. Hide it instead: its history stays.",
  );
  await expect(button(sheet, "Delete Rent")).toHaveCount(0);
  await button(sheet, "Hide Rent").click();

  await expect(toast(page)).toContainText("Hid Rent");
  await expect(
    page.getByRole("listitem").filter({ has: nameField(page, "Rent") }),
  ).toContainText("Hidden");

  await finishEditing(page);
  await expect.poll(() => budgetOutline(page)).not.toContain("Rent");
  await goTo(page, "Activity");
  await expectCategoryOffered(page, "Rent", false);
});

test("hidden Categories stay in place, and a Group with nothing visible shows only here", async ({
  page,
}) => {
  await editing(page);

  const sheet = await openMore(page, "Emergency Fund");
  await button(sheet, "Hide Emergency Fund").click();
  await expect(sheet).toBeHidden();

  // Undo first, then hide again, so both ways are covered.
  await button(toast(page), "Undo").click();
  await expect(page.getByText("Hidden", { exact: true })).toHaveCount(0);
  await button(
    await openMore(page, "Emergency Fund"),
    "Hide Emergency Fund",
  ).click();

  await expect(page.getByText("Hidden", { exact: true })).toBeVisible();
  await expect.poll(() => editorOutline(page)).toEqual(starter);

  await finishEditing(page);
  await expect.poll(() => budgetOutline(page)).not.toContain("Savings");

  await startEditing(page);
  await expect.poll(() => editorOutline(page)).toEqual(starter);

  const hidden = await openMore(page, "Emergency Fund");
  await button(hidden, "Unhide Emergency Fund").click();
  await expect(toast(page)).toContainText("Emergency Fund is back");
  await finishEditing(page);
  await expect.poll(() => budgetOutline(page)).toContain("Savings");
});

test("an empty Category Group deletes with Undo, back in its place", async ({
  page,
}) => {
  await editing(page);
  await button(page, "Add a Category Group").click();
  const field = page.getByRole("textbox", { name: "Add a Category Group" });
  await field.fill("Fun");
  await field.press("Enter");
  await field.blur();

  const sheet = await openMore(page, "Fun");
  await button(sheet, "Delete Fun").click();
  await expect(toast(page)).toContainText("Deleted Fun");
  await expect.poll(() => editorOutline(page)).toEqual(starter);
  await expect(page.locator(":focus")).toHaveCount(1);

  await button(toast(page), "Undo").click();
  await expect.poll(() => editorOutline(page)).toEqual([...starter, "Fun"]);
});

test("Move them and delete moves a Group's Categories, then deletes it, with Undo", async ({
  page,
}) => {
  await editing(page);

  const sheet = await openMore(page, "Everyday");
  await expect(sheet).toContainText(
    "Everyday can't be deleted while it holds 3 Categories. Move them first.",
  );
  await sheet.getByLabel("Move them to").selectOption("Savings");
  await button(sheet, "Move them and delete Everyday").click();

  await expect(toast(page)).toContainText("Deleted Everyday");
  await expect
    .poll(() => editorOutline(page))
    .toEqual([
      "Bills",
      "Rent",
      "Power",
      "Phone",
      "Internet",
      "Savings",
      "Emergency Fund",
      "Groceries",
      "Transport",
      "Dining Out",
    ]);

  await button(toast(page), "Undo").click();
  await expect.poll(() => editorOutline(page)).toEqual(starter);
});

test("the last Category Group has nowhere to move them, so it can't be deleted", async ({
  page,
}) => {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await startEditing(page);
  await button(page, "Add a Category Group").click();
  const groupField = page.getByRole("textbox", {
    name: "Add a Category Group",
  });
  await groupField.fill("Only");
  await groupField.blur();
  await button(page, "Add a Category to Only").click();
  await page
    .getByRole("textbox", { name: "Add a Category to Only" })
    .fill("Rent");
  await nameField(page, "Only").focus();

  const sheet = await openMore(page, "Only");
  await expect(sheet).toContainText("Add another Category Group");
  await expect(button(sheet, "Move them and delete Only")).toHaveCount(0);
});

test("Leave out of Spent this Month is a toggle in a Group's ⋯, with Undo", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await goTo(page, "Budget");
  await assign(page, "Rent", "100");
  const card = page.getByRole("region", { name: "Spent this Month" });
  await expect(card).toContainText("of $100.00");

  const toggleBills = async () => {
    await startEditing(page);
    const sheet = await openMore(page, "Bills");
    await sheet
      .getByRole("switch", { name: "Leave out of Spent this Month" })
      .click();
    await expect(sheet).toBeHidden();
  };

  await toggleBills();
  await expect(toast(page)).toContainText("Bills left out of Spent this Month");
  await finishEditing(page);
  await expect(card).not.toContainText("of $100.00");
  // The Group shows no tag outside Edit.
  await expect(page.getByRole("main").getByText(/left out/i)).toHaveCount(0);

  await toggleBills();
  await expect(toast(page)).toContainText(
    "Bills counts toward Spent this Month",
  );
  await button(toast(page), "Undo").click();
  await finishEditing(page);
  await expect(card).not.toContainText("of $100.00");

  await startEditing(page);
  await expect(
    (await openMore(page, "Bills")).getByRole("switch"),
  ).toBeChecked();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Edit has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await goTo(page, "Budget");
    await assign(page, "Rent", "50");
    await startEditing(page);
    await button(await openMore(page, "Power"), "Hide Power").click();

    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };
    await scan();

    await openMore(page, "Rent");
    await scan();
    await page.keyboard.press("Escape");

    await openMore(page, "Bills");
    await scan();
  });
}
