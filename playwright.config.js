import { defineConfig } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_PORT) || 5174;
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
      VITE_PORT: String(port),
      VITE_API_TARGET: "http://127.0.0.1:3002",
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  timeout: 45000,
});
