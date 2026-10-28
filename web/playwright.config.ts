import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const testDatabase = resolve(
  process.cwd(),
  "../data/test-runs",
  randomUUID(),
  "workspace.sqlite3",
);

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  expect: { timeout: 12000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1050 },
  },
  webServer: [
    {
      command:
        "..\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001 --app-dir ..",
      url: "http://127.0.0.1:8001/api/health",
      env: { PRIVACYTWIN_DB: testDatabase },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3001",
      url: "http://127.0.0.1:3001",
      env: { PRIVACYTWIN_API_URL: "http://127.0.0.1:8001" },
      reuseExistingServer: false,
    },
  ],
});
