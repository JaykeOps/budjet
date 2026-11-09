import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * The ids of the accessibility violations on the page as it stands, scanned in
 * the light theme and then the dark one, so a contrast fault in either shows.
 * The page goes back to following the system after.
 */
export async function violationsInEachTheme(
  page: Page,
  { seriousOnly = false }: { seriousOnly?: boolean } = {},
): Promise<{ light: string[]; dark: string[] }> {
  const scan = async (colorScheme: "light" | "dark") => {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).analyze();
    return violations
      .filter(
        ({ impact }) =>
          !seriousOnly || impact === "serious" || impact === "critical",
      )
      .map(({ id }) => id);
  };
  const found = { light: await scan("light"), dark: await scan("dark") };
  await page.emulateMedia({ colorScheme: null });
  return found;
}
