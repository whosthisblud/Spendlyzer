import { expect, test as base } from "@playwright/test";
import { test } from "./fixtures";

base("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Register" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("signed-in users land on the dashboard and can sign out", async ({ page, user }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(user.email)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("sign out still works when Supabase is unreachable", async ({ page }) => {
  await page.goto("/dashboard");
  await page.unrouteAll();
  await page.route("https://e2e.supabase.co/**", (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // The persisted session is gone, not just hidden.
  expect(await page.evaluate(() => window.localStorage.getItem("sb-e2e-auth-token"))).toBeNull();
});
