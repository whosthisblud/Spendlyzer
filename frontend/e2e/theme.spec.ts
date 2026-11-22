import { expect, test as base } from "@playwright/test";
import { test } from "./fixtures";

const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = "rgb(250, 250, 250)";
const DARK = "rgb(9, 9, 11)";

base("follows the OS colour scheme by default", async ({ browser }) => {
  for (const [scheme, expected] of [["light", LIGHT], ["dark", DARK]] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto("/login");
    expect(await bg(page)).toBe(expected);
    await expect(page.getByRole("radio", { name: "System theme" })).toHaveAttribute("aria-checked", "true");
    await ctx.close();
  }
});

test("chosen theme overrides the OS, persists across pages and reloads, with no flash", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");
  await page.getByRole("radio", { name: "Dark theme" }).click();
  expect(await bg(page)).toBe(DARK);

  // Theme must be applied before any app code runs, so the first paint is already dark.
  await page.goto("/transactions", { waitUntil: "commit" });
  await page.waitForSelector("body");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  await page.reload();
  expect(await bg(page)).toBe(DARK);
  await expect(page.getByRole("radio", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: "Light theme" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await bg(page)).toBe(LIGHT);
});
