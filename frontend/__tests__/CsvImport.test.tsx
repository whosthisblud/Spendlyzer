import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: unknown[]) => api(...args) }));

import { CsvImport } from "@/components/CsvImport";

const file = () => new File(["date,amount,description\n2026-10-01,100,Tea\n"], "t.csv", { type: "text/csv" });

describe("CsvImport", () => {


  it("disables import until a file is chosen", () => {
    render(<CsvImport onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("uploads the file and shows the result with row errors", async () => {
    api.mockResolvedValue({ total_rows: 4, imported: 2, duplicates: 1, failed: 1, errors: [{ row: 5, error: "Invalid amount 'abc'" }] });
    const onDone = vi.fn();
    const { container } = render(<CsvImport onDone={onDone} />);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file());
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/imported/)).toHaveTextContent("2 imported, 1 duplicates skipped, 1 failed of 4 rows.");
    expect(screen.getByText("Row 5: Invalid amount 'abc'")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledOnce();

    const [path, init] = api.mock.calls.at(-1)!;
    expect(path).toBe("/api/transactions/import");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("does not refresh the list when nothing was imported", async () => {
    api.mockResolvedValue({ total_rows: 1, imported: 0, duplicates: 1, failed: 0, errors: [] });
    const onDone = vi.fn();
    const { container } = render(<CsvImport onDone={onDone} />);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file());
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText(/duplicates skipped/);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows API errors", async () => {
    api.mockRejectedValue(new Error("Missing required column(s): amount"));
    const { container } = render(<CsvImport onDone={vi.fn()} />);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file());
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Missing required column(s): amount")).toBeInTheDocument();
  });
});
