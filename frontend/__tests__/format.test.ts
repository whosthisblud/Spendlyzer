import { describe, expect, it } from "vitest";
import { firstOfMonth, formatDate, formatMoney, monthLabel, toISODate } from "@/lib/format";

describe("formatMoney", () => {
  it("formats INR with Indian digit grouping", () => {
    expect(formatMoney("125000.5")).toBe("₹1,25,000.50");
    expect(formatMoney(0)).toBe("₹0.00");
  });

  it("formats other currencies", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("uses compact notation when asked", () => {
    expect(formatMoney(80000, "INR", true)).toBe("₹80K");
  });

  it("treats invalid and missing values as zero", () => {
    expect(formatMoney("abc")).toBe("₹0.00");
    expect(formatMoney(null)).toBe("₹0.00");
    expect(formatMoney(undefined)).toBe("₹0.00");
  });
});

describe("dates", () => {
  it("formats ISO dates without timezone drift", () => {
    expect(formatDate("2026-10-01")).toBe("01 Oct 2026");
  });

  it("converts Date to local ISO date", () => {
    expect(toISODate(new Date(2026, 0, 31, 23, 30))).toBe("2026-01-31");
  });

  it("labels months", () => {
    expect(monthLabel("2026-03")).toBe("Mar 26");
  });

  it("returns the first day of the month", () => {
    expect(firstOfMonth(new Date(2026, 10, 22))).toBe("2026-11-01");
  });
});
