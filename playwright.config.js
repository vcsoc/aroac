import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev",
    env: {
      NODE_ENV: "test",
      DATABASE_PATH: "data/browser-tests.sqlite",
      PORT: "3002",
      VITE_PORT: "5174",
      VITE_API_TARGET: "http://127.0.0.1:3002",
    },
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
  },
  timeout: 45000,
});
