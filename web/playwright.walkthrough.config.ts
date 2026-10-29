import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// Dedicated documentation run. Never connects to the user's ports/database.
export default defineConfig({
  testDir: "./walkthrough",
  timeout: 300000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: "list",
  outputDir: "test-results-walkthrough",
  use: {
    baseURL: "http://127.0.0.1:3002",
    channel: "msedge",
    headless: true,
    viewport: { width: 1500, height: 1100 },
    trace: "retain-on-failure",
    actionTimeout: 15000,
  },
  webServer: [
    {
      command:
        "..\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --app-dir ..",
      url: "http://127.0.0.1:8002/api/health",
      env: {
        PRIVACYTWIN_DB: resolve(
          process.cwd(),
          "../data/walkthrough-runs",
          randomUUID(),
          "workspace.sqlite3",
        ),
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3002",
      url: "http://127.0.0.1:3002",
      env: { PRIVACYTWIN_API_URL: "http://127.0.0.1:8002" },
      reuseExistingServer: false,
    },
  ],
});
