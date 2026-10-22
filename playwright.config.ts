import { createRequire } from "node:module";
import { defineConfig, devices } from "@playwright/test";

// The browsers come from the flake; they only work with the exact @playwright/test they were built for.
const nixVersion = process.env.PLAYWRIGHT_NIX_VERSION;
const { version } = createRequire(import.meta.url)(
  "@playwright/test/package.json",
);
if (nixVersion && version !== nixVersion) {
  throw new Error(
    `@playwright/test is ${version} but the flake's browsers are for ${nixVersion}: pin package.json to ${nixVersion}.`,
  );
}

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: "http://localhost:4173" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
