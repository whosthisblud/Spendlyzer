import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8100;
const WEB_PORT = 3100;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const E2E_JWT_SECRET = "e2e-jwt-secret-e2e-jwt-secret-e2e-0001";
export const E2E_SUPABASE_URL = "https://e2e.supabase.co";

const webEnv = {
  NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  NEXT_PUBLIC_API_URL: API_URL,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      // Real FastAPI backend on a throwaway SQLite database, accepting HS256 tokens signed by the tests.
      command: "bash e2e/start-api.sh",
      url: `${API_URL}/health`,
      env: { API_PORT: String(API_PORT), E2E_JWT_SECRET, CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx next build && npx next start -H 127.0.0.1 -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      env: webEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
