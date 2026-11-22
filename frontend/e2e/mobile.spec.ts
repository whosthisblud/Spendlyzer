import { expect, test, today } from "./fixtures";

test("mobile navigation and transaction list", async ({ page, api }) => {
  await api.post("/api/transactions", { amount: "180", description: "Metro card recharge", date: today(), type: "expense" });
  await page.goto("/dashboard");

  await expect(page.getByRole("link", { name: "Transactions" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  const item = page.getByRole("listitem").filter({ hasText: "Metro card recharge" });
  await expect(item).toContainText("Transport");
  await expect(item).toContainText("-₹180.00");

  // No horizontal scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await item.click();
  await expect(page.getByRole("dialog", { name: "Edit transaction" })).toBeVisible();
});
