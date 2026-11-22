import { test as signedOut, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { expect, signToken, test, today } from "./fixtures";

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === "activated" && Boolean(navigator.serviceWorker.controller);
  });
}

/**
 * Navigates and confirms the new document is controlled by the service worker.
 *
 * Under Playwright, Chromium occasionally loads a navigation from the network even though the
 * registration is active and activated (observed ~1 in 30 runs, more with page.route enabled).
 * Real browsers route navigations in scope through the active worker, so this retries the
 * navigation rather than masking an app problem. Requests from a controlled page always go
 * through the worker, so only navigations need this.
 */
async function gotoControlled(page: Page, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url);
      if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) return;
    } catch (err) {
      if (attempt >= 4) throw err;
      continue;
    }
    if (attempt >= 4) throw new Error(`${url} was never controlled by the service worker`);
  }
}

/** Waits until the worker has finished saving these pages (writes complete asynchronously). */
async function waitForSavedPages(page: Page, paths: string[]) {
  await page.waitForFunction(async (wanted) => {
    const keys = (await caches.keys()).filter((k) => k.startsWith("pages-"));
    for (const p of wanted) {
      let found = false;
      for (const k of keys) if (await (await caches.open(k)).match(`${location.origin}${p}`, { ignoreSearch: true })) found = true;
      if (!found) return false;
    }
    return true;
  }, paths);
}

signedOut("serves an installable manifest with working icons", async ({ request, page }) => {
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Spendlyzer", display: "standalone", start_url: "/dashboard", scope: "/" });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));

  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/image\//);
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /^#/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
});

signedOut("service worker is never cached by the browser", async ({ request }) => {
  const r = await request.get("/sw.js");
  expect(r.headers()["cache-control"]).toContain("no-cache");
  expect(r.headers()["content-type"]).toContain("javascript");
});

test("works offline with the last synced data", async ({ page, context, api }) => {
  await api.post("/api/transactions", { amount: "64000", description: "Salary", date: today(), type: "income" });
  await api.post("/api/transactions", { amount: "1450", description: "BigBasket groceries", date: today(), type: "expense" });

  await page.goto("/dashboard");
  await waitForServiceWorker(page);
  await gotoControlled(page, "/dashboard"); // page and API responses now go through the worker
  await expect(page.getByRole("group", { name: "Income" })).toContainText("₹64,000.00");
  await gotoControlled(page, "/transactions");
  await expect(page.getByRole("row", { name: /BigBasket groceries/ })).toBeVisible();
  await waitForSavedPages(page, ["/dashboard", "/transactions"]);

  await context.setOffline(true);
  await gotoControlled(page, "/dashboard");
  await expect(page.getByRole("group", { name: "Income" })).toContainText("₹64,000.00");
  await expect(page.getByRole("status")).toContainText("You're offline.");
  await expect(page.getByRole("status")).toContainText("Showing saved data from");

  await gotoControlled(page, "/transactions");
  await expect(page.getByRole("row", { name: /BigBasket groceries/ })).toBeVisible();

  // Writes are not queued or faked offline: the user gets a clear error.
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("99");
  await dialog.getByLabel("Description").fill("Offline chai");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toContainText("Cannot reach the API");

  await context.setOffline(false);
  await page.goto("/dashboard");
  await expect(page.getByRole("status")).toBeHidden();
});

test("saved data is separated per user and wiped on sign-out", async ({ page, context, api, user }) => {
  await api.post("/api/transactions", { amount: "777", description: "Private to user A", date: today(), type: "expense" });
  await page.goto("/transactions");
  await waitForServiceWorker(page);
  await gotoControlled(page, "/transactions");
  await expect(page.getByRole("row", { name: /Private to user A/ })).toBeVisible();

  const apiCaches = () => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("api-")));
  expect(await apiCaches()).toEqual([`api-${user.id}`]);

  // Same device, different account, offline: user A's saved data must not be served.
  const otherId = crypto.randomUUID();
  const otherToken = signToken(otherId, "b@spendlyzer.test");
  await page.evaluate(
    ([token, id]) => {
      const key = "sb-e2e-auth-token";
      const s = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...s, access_token: token, user: { ...s.user, id, email: "b@spendlyzer.test" } }));
    },
    [otherToken, otherId] as const,
  );
  await context.setOffline(true);
  await page.evaluate(async (apiUrl) => {
    const s = JSON.parse(localStorage.getItem("sb-e2e-auth-token")!);
    (window as Window & { __probe?: number | string }).__probe = await fetch(`${apiUrl}/api/transactions?limit=25&offset=0`, {
      headers: { Authorization: `Bearer ${s.access_token}` },
    })
      .then((r) => r.status)
      .catch(() => "network-error");
  }, API_URL);
  expect(await page.evaluate(() => (window as Window & { __probe?: number | string }).__probe)).toBe("network-error");
  await context.setOffline(false);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await apiCaches()).toEqual([]);
});

test("pages reached through in-app links open offline", async ({ page, context, api }) => {
  await api.post("/api/transactions", { amount: "40000", description: "Salary", date: today(), type: "income" });
  await page.goto("/dashboard");
  await waitForServiceWorker(page);
  await gotoControlled(page, "/dashboard");

  // Client-side navigation: the browser never requests /insights as a page.
  await page.getByRole("link", { name: "Insights" }).click();
  await expect(page.getByText("Monthly summary")).toBeVisible();
  await page.waitForFunction(async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("pages-") && (await (await caches.open(key)).match(`${location.origin}/insights`))) return true;
    }
    return false;
  });

  await context.setOffline(true);
  await gotoControlled(page, "/insights");
  await expect(page.getByText("Monthly summary")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Showing saved data");
});

test("home-screen shortcut opens the add transaction form", async ({ page }) => {
  await page.goto("/transactions?new=1");
  await expect(page.getByRole("dialog", { name: "Add transaction" })).toBeVisible();
  await expect(page).toHaveURL(/\/transactions$/);
});
