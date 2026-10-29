import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

if (process.env.PRIVACYTWIN_LIVE_AI !== "1") {
  throw new Error(
    "Live capture needs explicit PRIVACYTWIN_LIVE_AI=1; it calls the real provider.",
  );
}
const keyFile = resolve(process.cwd(), "../data/gemini-key.txt");
const serverKey =
  process.env.GEMINI_API_KEY ||
  (existsSync(keyFile) ? readFileSync(keyFile, "utf-8").trim() : "");
if (!serverKey)
  throw new Error(
    "No server Gemini key configured. No provider request was made.",
  );
const database =
  process.env.PRIVACYTWIN_LIVE_GUIDE_DB ||
  resolve(
    process.cwd(),
    "../data/live-guide-runs",
    randomUUID(),
    "workspace.sqlite3",
  );
process.env.PRIVACYTWIN_LIVE_GUIDE_DB = database;

export default defineConfig({
  testDir: "./live-guide",
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: "list",
  outputDir: "test-results-live-guide",
  use: {
    baseURL: "http://127.0.0.1:3003",
    channel: "msedge",
    headless: true,
    viewport: { width: 1500, height: 1100 },
    actionTimeout: 15000,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "..\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8003 --app-dir ..",
      url: "http://127.0.0.1:8003/api/health",
      env: { PRIVACYTWIN_DB: database, GEMINI_API_KEY: serverKey },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3003",
      url: "http://127.0.0.1:3003",
      env: { PRIVACYTWIN_API_URL: "http://127.0.0.1:8003" },
      reuseExistingServer: false,
    },
  ],
});
