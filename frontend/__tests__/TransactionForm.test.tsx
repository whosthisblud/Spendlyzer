import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Category, Transaction } from "@/lib/types";

const api = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: unknown[]) => api(...args) }));

import { TransactionForm } from "@/components/TransactionForm";

const categories: Category[] = [
  { id: "food", name: "Food & Dining", type: "expense" },
  { id: "transport", name: "Transport", type: "expense" },
  { id: "salary", name: "Salary", type: "income" },
];

function respond(predict: { category: string | null; source: string } = { category: null, source: "none" }) {
  api.mockImplementation(async (path: string) => (path === "/api/ml/classifier/predict" ? predict : { id: "new" }));
}

const categorySelect = () => screen.getByRole("combobox", { name: "Category" });
const lastWrite = () => api.mock.calls.filter(([p]) => p !== "/api/ml/classifier/predict").at(-1)!;

describe("TransactionForm", () => {

  it("creates an expense with the entered values", async () => {
    respond();
    const onSaved = vi.fn();
    render(<TransactionForm categories={categories} onSaved={onSaved} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "450.50");
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Dinner");
    await userEvent.selectOptions(categorySelect(), "food");
    await userEvent.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const [path, init] = lastWrite();
    expect(path).toBe("/api/transactions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      amount: "450.50", currency: "INR", description: "Dinner", type: "expense", payment_method: "upi", category_id: "food",
    });
  });

  it("only offers categories matching the transaction type", async () => {
    respond();
    render(<TransactionForm categories={categories} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "income" }));
    expect(screen.getByRole("option", { name: "Salary" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Transport" })).not.toBeInTheDocument();
  });

  it("suggests a category while typing and applies it", async () => {
    respond({ category: "Transport", source: "rules" });
    render(<TransactionForm categories={categories} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Uber to office");
    expect(await screen.findByText("Transport", { selector: "span" }, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText(/keyword rules/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use it" }));
    expect(categorySelect()).toHaveValue("transport");
  });

  it("updates an existing transaction with PATCH", async () => {
    respond();
    const initial: Transaction = {
      id: "t1", amount: "300.00", currency: "INR", description: "Swiggy", date: "2026-10-05", type: "expense",
      payment_method: "upi", category_id: "food", category_name: "Food & Dining", category_source: "rules",
    };
    render(<TransactionForm initial={initial} categories={categories} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "320");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(lastWrite()[0]).toBe("/api/transactions/t1"));
    const [, init] = lastWrite();
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body).amount).toBe("320");
  });

  it("shows server validation errors and does not close", async () => {
    api.mockImplementation(async (path: string) => {
      if (path === "/api/ml/classifier/predict") return { category: null, source: "none" };
      throw new Error("Category 'Salary' is for income");
    });
    const onSaved = vi.fn();
    render(<TransactionForm categories={categories} onSaved={onSaved} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "100");
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Thing");
    await userEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("Category 'Salary' is for income")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
