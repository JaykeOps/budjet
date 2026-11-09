/// <reference types="vitest/config" />
import optimizeLocales from "@react-aria/optimize-locales-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults } from "vitest/config";

export default defineConfig({
  // Relative, so the build works at any address: GitHub Pages' /budjet/ or a domain's root.
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.CROWNKEEP_VERSION ?? "v0.0.0-dev",
    ),
  },
  plugins: [
    // The app is English only, so React Aria's other locales stay out of the bundle.
    { ...optimizeLocales.vite({ locales: ["en-US"] }), enforce: "pre" },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: {
        // The defaults leave fonts out, and Geist must work offline.
        globPatterns: ["**/*.{js,css,html,woff2}"],
      },
      manifest: {
        name: "Crownkeep",
        short_name: "Crownkeep",
        description:
          "Local-first budgeting that keeps your data in your own Data Folder.",
        theme_color: "#18181d",
        background_color: "#18181d",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    passWithNoTests: true,
    // Performance tests time wall-clock runs, so they run alone, never beside
    // the other checks that would compete for the same CPU.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "**/*.performance.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "performance",
          include: ["src/**/*.performance.test.ts"],
        },
      },
    ],
  },
});
