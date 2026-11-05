import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  createBudget,
  editorOutline,
  goTo,
  handleOf,
  startEditing,
  toast,
} from "./helpers";

/** A real finger: `page.mouse` would send mouse pointers, which `touch-action` doesn't affect. */
async function fingerOn(page: Page, start: Locator) {
  const client = await page.context().newCDPSession(page);
  const box = await start.boundingBox();
  if (!box) throw new Error("Nothing to touch");
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    x: number,
    y: number,
  ) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await touch("touchStart", box.x + box.width / 2, box.y + box.height / 2);
  return {
    move: async (to: { x: number; y: number }) => {
      await touch("touchMove", to.x, to.y);
      // Placing happens on the next frame.
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(done)),
      );
    },
    lift: () => touch("touchEnd", 0, 0),
  };
}

async function middleOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Nowhere to drag to");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await startEditing(page);
});

test("a handle drags by touch, across Category Groups, and survives its row moving", async ({
  page,
}) => {
  const finger = await fingerOn(page, handleOf(page, "Internet"));

  await finger.move(
    await middleOf(page.getByRole("textbox", { name: "Name of Groceries" })),
  );
  // Crossing remounted the row under the finger, so this only lands if the drag lives on.
  await finger.move(
    await middleOf(page.getByRole("textbox", { name: "Name of Transport" })),
  );
  await finger.lift();

  await expect(toast(page)).toContainText(/Internet, [23] of 4 in Everyday/);
  await expect
    .poll(async () => (await editorOutline(page)).slice(0, 4))
    .toEqual(["Bills", "Rent", "Power", "Phone"]);
});

test("a drag held at the bottom scrolls the list to what's further down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 500 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const finger = await fingerOn(page, handleOf(page, "Rent"));

  await finger.move({ x: 200, y: 480 });
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await finger.lift();

  await expect(toast(page)).toContainText("Rent,");
  await expect
    .poll(async () => (await editorOutline(page)).indexOf("Rent"))
    .toBeGreaterThan(1);
});
