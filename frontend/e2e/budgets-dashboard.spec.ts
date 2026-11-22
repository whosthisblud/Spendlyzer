import { expect, test, today } from "./fixtures";

test("budget warnings appear when a category limit is exceeded", async ({ page, api }) => {
  await page.goto("/budgets");
  await expect(page.getByText("No budgets for this month")).toBeVisible();

  await page.getByRole("button", { name: "New budget" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category").selectOption({ label: "Food & Dining" });
  await dialog.getByLabel("Monthly limit (INR)").fill("500");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("On track")).toBeVisible();

  // Duplicate budget for the same category and month is rejected with the API's message.
  await page.getByRole("button", { name: "New budget" }).click();
  await dialog.getByLabel("Category").selectOption({ label: "Food & Dining" });
  await dialog.getByLabel("Monthly limit (INR)").fill("900");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toContainText("A budget for this category and month already exists");
  await page.keyboard.press("Escape");

  await api.post("/api/transactions", { amount: "420", description: "Zomato dinner", date: today(), type: "expense" });
  await page.reload();
  await expect(page.getByText("Near limit")).toBeVisible();
  await expect(page.getByText("Budget warnings")).toBeVisible();

  await api.post("/api/transactions", { amount: "200", description: "Swiggy order", date: today(), type: "expense" });
  await page.reload();
  await expect(page.getByText("Exceeded")).toBeVisible();
  await expect(page.getByText("₹620.00 of ₹500.00 (124%), ₹120.00 over")).toBeVisible();
  await expect(page.getByText("Food & Dining: 124% used (over limit)")).toBeVisible();
});

test("dashboard totals reflect seeded transactions and the empty state", async ({ page, api }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("No transactions in this range")).toBeVisible();

  await api.post("/api/transactions", { amount: "60000", description: "Salary", date: today(), type: "income" });
  await api.post("/api/transactions", { amount: "15000", description: "Rent", date: today(), type: "expense", category_id: await api.categoryId("Rent") });
  await api.post("/api/transactions", { amount: "2500", description: "Amazon order", date: today(), type: "expense" });
  await api.post("/api/transactions", { amount: "100", description: "USD thing", date: today(), type: "expense", currency: "USD" });

  await page.reload();
  const stat = (label: string) => page.getByRole("group", { name: label });
  await expect(stat("Income")).toContainText("₹60,000.00");
  await expect(stat("Expenses")).toContainText("₹17,500.00");
  await expect(stat("Balance")).toContainText("₹42,500.00");
  await expect(stat("Transactions")).toContainText("3");

  const categories = page.locator("section", { hasText: "Spending by category" });
  await expect(categories.getByRole("listitem").first()).toContainText("Rent");
  await expect(categories.getByRole("listitem").nth(1)).toContainText("Shopping");
  await expect(page.locator("section", { hasText: "Monthly income vs expenses" }).locator(".recharts-bar-rectangle").first()).toBeVisible();
});

test("insights handle insufficient history and report the month", async ({ page, api }) => {
  await api.post("/api/transactions", { amount: "40000", description: "Salary", date: today(), type: "income" });
  await api.post("/api/transactions", { amount: "1200", description: "Zomato dinner", date: today(), type: "expense" });

  await page.goto("/insights");
  await expect(page.getByText("Monthly summary")).toBeVisible();
  await expect(page.getByText(/You spent ₹1,200 and earned ₹40,000/)).toBeVisible();
  await expect(page.getByText("Savings rate")).toBeVisible();
  await expect(page.locator("section", { hasText: "Expense forecast" })).toContainText("Not enough history yet");
  await expect(page.locator("section", { hasText: "Flagged transactions" })).toContainText("Not enough history yet");

  await page.getByRole("button", { name: "Train on my data" }).click();
  await expect(page.locator("section", { hasText: "Category classifier" })).toContainText("Need at least 30 categorized transactions");
});
