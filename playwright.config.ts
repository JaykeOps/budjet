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

/** Where the same build answers under a subpath, as GitHub Pages serves it. */
export const SUBPATH_ADDRESS = "http://localhost:4174/budjet/";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: "http://localhost:4173" },
  // Specs run on both. A flow that really differs splits into *.phone.spec.ts and *.desktop.spec.ts.
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /\.phone\.spec\.ts$/,
    },
    {
      name: "Pixel 7",
      use: { ...devices["Pixel 7"] },
      testIgnore: /\.desktop\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      command: "pnpm preview",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "pnpm exec vite preview --base /budjet/ --port 4174 --strictPort",
      url: SUBPATH_ADDRESS,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
