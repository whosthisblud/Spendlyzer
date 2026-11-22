"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { ImportResult } from "@/lib/types";
import { Button, ErrorBox } from "./ui";

const TEMPLATE = "date,amount,description,type,category,payment_method\n2026-10-01,75000,October salary,income,Salary,net banking\n2026-10-03,450,Swiggy order,expense,,upi\n";

export function CsvImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<ImportResult>("/api/transactions/import", { method: "POST", body: fd });
      setResult(r);
      if (r.imported > 0) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Required columns: <code>date</code>, <code>amount</code>, <code>description</code>. Optional: <code>type</code>, <code>category</code>, <code>currency</code>,{" "}
        <code>payment_method</code>. Dates as YYYY-MM-DD or DD/MM/YYYY. Duplicates are skipped.{" "}
        <a href={templateHref} download="spendlyzer-template.csv" className="font-medium text-emerald-600 hover:underline">
          Download template
        </a>
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-zinc-800 dark:file:text-zinc-100"
      />
      {error && <ErrorBox message={error} />}
      {result && (
        <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <p>
            <span className="font-semibold">{result.imported}</span> imported, <span className="font-semibold">{result.duplicates}</span> duplicates skipped,{" "}
            <span className="font-semibold">{result.failed}</span> failed of {result.total_rows} rows.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-red-600">
              {result.errors.map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!file || busy}>
          {busy ? "Importing..." : "Import"}
        </Button>
      </div>
    </form>
  );
}
