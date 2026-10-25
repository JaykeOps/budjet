/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.BUDJET_VERSION ?? "v0.0.0-dev"),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "budjet",
        short_name: "budjet",
        description:
          "Local-first budgeting that keeps your data in your own Data Folder.",
        theme_color: "#1f6f5c",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  test: {
    passWithNoTests: true,
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
});
