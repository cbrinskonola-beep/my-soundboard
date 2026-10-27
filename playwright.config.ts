import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: false,
  },
  workers: 1,
});
