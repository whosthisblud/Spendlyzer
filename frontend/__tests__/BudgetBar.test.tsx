import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetBar } from "@/components/BudgetBar";
import type { BudgetStatus } from "@/lib/types";

const base: BudgetStatus = {
  id: "b1",
  category_id: "c1",
  category_name: "Food & Dining",
  monthly_limit: "8000.00",
  currency: "INR",
  period: "2026-11-01",
  spent: "2000.00",
  remaining: "6000.00",
  utilization: 0.25,
  status: "ok",
};

describe("BudgetBar", () => {
  it("shows on-track state with remaining amount", () => {
    render(<BudgetBar b={base} />);
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText(/₹2,000.00 of ₹8,000.00 \(25%\), ₹6,000.00 left/)).toBeInTheDocument();
  });

  it("shows warning state", () => {
    render(<BudgetBar b={{ ...base, spent: "7000.00", remaining: "1000.00", utilization: 0.875, status: "warning" }} />);
    expect(screen.getByText(/Near limit/)).toBeInTheDocument();
  });

  it("shows exceeded state with the overspend and caps the bar at 100%", () => {
    const { container } = render(
      <BudgetBar b={{ ...base, spent: "25108.63", remaining: "-17108.63", utilization: 3.1386, status: "exceeded" }} />,
    );
    expect(screen.getByText(/Exceeded/)).toBeInTheDocument();
    expect(screen.getByText(/₹17,108.63 over/)).toBeInTheDocument();
    const fill = container.querySelector(".bg-red-500") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });
});
