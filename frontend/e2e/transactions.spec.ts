import path from "node:path";
import { expect, test, today } from "./fixtures";

test("add, auto-categorize, correct, edit and delete a transaction", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByText("No transactions found")).toBeVisible();

  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("349.50");
  await dialog.getByLabel("Description").fill("Swiggy order");
  await expect(dialog.getByText("Suggested:")).toContainText("Food & Dining");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row", { name: /Swiggy order/ });
  await expect(row).toContainText("-₹349.50");
  await expect(row.getByLabel("Category")).toHaveValue(/.+/);
  await expect(row.getByLabel("Category").locator("option:checked")).toHaveText("Food & Dining");
  await expect(row.getByText("auto")).toBeVisible();

  // Manual correction clears the auto badge.
  await row.getByLabel("Category").selectOption({ label: "Groceries" });
  await expect(row.getByText("auto")).toBeHidden();
  await expect(row.getByLabel("Category").locator("option:checked")).toHaveText("Groceries");

  await row.getByRole("button", { name: "Edit" }).click();
  await dialog.getByLabel("Amount").fill("400");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toContainText("-₹400.00");

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No transactions found")).toBeVisible();
});

test("rejects invalid amounts client-side", async ({ page }) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("12.345");
  await dialog.getByLabel("Description").fill("Bad amount");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.getByLabel("Amount").evaluate((el: HTMLInputElement) => el.validity.patternMismatch)).toBe(true);
});

test("CSV import reports results and skips duplicates", async ({ page }) => {
  const csv = path.resolve(__dirname, "../../docs/sample_transactions.csv");
  await page.goto("/transactions");

  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(csv);
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog).toContainText("12 imported, 0 duplicates skipped, 0 failed of 12 rows.");
  await page.keyboard.press("Escape");
  await expect(page.getByText("1-12 of 12")).toBeVisible();
  await expect(page.getByRole("row", { name: /BigBasket groceries/ }).getByLabel("Category").locator("option:checked")).toHaveText("Groceries");

  await page.getByRole("button", { name: "Import CSV" }).click();
  await dialog.locator('input[type="file"]').setInputFiles(csv);
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog).toContainText("0 imported, 12 duplicates skipped");
});

test("CSV import shows per-row errors", async ({ page }) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`date,amount,description\n${today()},abc,Broken\n31/02/2026,100,Bad date\n${today()},250,Fine\n`),
  });
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog).toContainText("1 imported, 0 duplicates skipped, 2 failed of 3 rows.");
  await expect(dialog).toContainText("Row 2: Invalid amount 'abc'");
  await expect(dialog).toContainText("Row 3: Unrecognized date '31/02/2026'");
});

test("filters by type and search", async ({ page, api }) => {
  await api.post("/api/transactions", { amount: "50000", description: "Salary", date: today(), type: "income" });
  await api.post("/api/transactions", { amount: "220", description: "Uber ride", date: today(), type: "expense" });
  await api.post("/api/transactions", { amount: "150", description: "Chai", date: today(), type: "expense" });

  await page.goto("/transactions");
  await expect(page.getByText("1-3 of 3")).toBeVisible();
  await page.getByLabel("Type filter").selectOption("income");
  await expect(page.getByText("1-1 of 1")).toBeVisible();
  await expect(page.getByRole("row", { name: /Salary/ })).toContainText("+₹50,000.00");
  await page.getByLabel("Type filter").selectOption("");
  await page.getByPlaceholder("Search").fill("uber");
  await expect(page.getByText("1-1 of 1")).toBeVisible();
  await expect(page.getByRole("row", { name: /Uber ride/ })).toBeVisible();
});

test("users cannot see each other's data", async ({ page, api, request }) => {
  await api.post("/api/transactions", { amount: "999", description: "Private purchase", date: today(), type: "expense" });
  await page.goto("/transactions");
  await expect(page.getByRole("row", { name: /Private purchase/ })).toBeVisible();

  const { signToken } = await import("./fixtures");
  const other = signToken(crypto.randomUUID(), "other@spendlyzer.test");
  const { API_URL } = await import("../playwright.config");
  const r = await request.get(`${API_URL}/api/transactions`, { headers: { Authorization: `Bearer ${other}` } });
  expect((await r.json()).total).toBe(0);
});
