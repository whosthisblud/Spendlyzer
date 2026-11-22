import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryChart } from "@/components/charts/CategoryChart";

const rows = Array.from({ length: 10 }, (_, i) => ({ category: `Cat ${i + 1}`, total: String(1000 - i * 50), share: 0.1 }));

describe("CategoryChart", () => {
  it("renders every category when under the limit", () => {
    render(<CategoryChart data={rows.slice(0, 3)} currency="INR" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Cat 1")).toBeInTheDocument();
  });

  it("folds the tail into Other", () => {
    render(<CategoryChart data={rows} currency="INR" limit={8} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(screen.getByText("Other (3)")).toBeInTheDocument();
    // 650 + 600 + 550 folded together
    expect(items[7]).toHaveTextContent("₹1,800.00");
    expect(items[7]).toHaveTextContent("30%");
  });
});
