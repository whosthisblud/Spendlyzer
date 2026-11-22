"use client";

import { useEffect, useState } from "react";
import { CsvImport } from "@/components/CsvImport";
import { TransactionForm } from "@/components/TransactionForm";
import { Badge, Button, Card, Empty, ErrorBox, Input, Loading, Modal, Select } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import { api, qs } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, type Transaction, type TransactionList } from "@/lib/types";

const PAGE = 25;
const SOURCE_LABEL = { ml: "model", rules: "auto" } as const;

export default function TransactionsPage() {
  const { categories } = useCategories();
  const [filters, setFilters] = useState({ q: "", type: "", category_id: "", start: "", end: "" });
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Home-screen shortcut "Add transaction" opens /transactions?new=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      setShowForm(true);
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const uncategorized = filters.category_id === "__none";
  const path = `/api/transactions${qs({
    ...filters,
    category_id: uncategorized ? "" : filters.category_id,
    uncategorized: uncategorized || undefined,
    limit: PAGE,
    offset,
  })}`;
  const { data, error, loading, reload } = useApi<TransactionList>(path);

  const update = (k: keyof typeof filters, v: string) => {
    setOffset(0);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  async function remove(t: Transaction) {
    if (!confirm(`Delete "${t.description}"?`)) return;
    try {
      await api(`/api/transactions/${t.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function recategorize(t: Transaction, categoryId: string) {
    try {
      await api(`/api/transactions/${t.id}`, { method: "PATCH", body: JSON.stringify({ category_id: categoryId || null }) });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const pm = (v: string | null) => PAYMENT_METHODS.find((p) => p.value === v)?.label ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            Import CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add transaction
          </Button>
        </div>
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input placeholder="Search" aria-label="Search transactions" value={filters.q} onChange={(e) => update("q", e.target.value)} className="col-span-2 md:col-span-1" />
          <Select aria-label="Type filter" value={filters.type} onChange={(e) => update("type", e.target.value)}>
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </Select>
          <Select aria-label="Category filter" value={filters.category_id} onChange={(e) => update("category_id", e.target.value)}>
            <option value="">All categories</option>
            <option value="__none">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </Select>
          <Input type="date" value={filters.start} onChange={(e) => update("start", e.target.value)} aria-label="From" />
          <Input type="date" value={filters.end} onChange={(e) => update("end", e.target.value)} aria-label="To" />
        </div>

        {(error || actionError) && <ErrorBox message={(error || actionError)!} />}
        {loading && !data && <Loading />}
        {data && data.items.length === 0 && <Empty title="No transactions found" hint="Add one or import a CSV to get started." />}
        {data && data.items.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-zinc-500">{formatDate(t.date)}</td>
                      <td className="max-w-xs truncate py-2.5 pr-3">{t.description}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={t.category_id ?? ""}
                            onChange={(e) => recategorize(t, e.target.value)}
                            className="max-w-40 rounded border-0 bg-transparent py-0.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label="Category"
                          >
                            <option value="">Uncategorized</option>
                            {categories
                              .filter((c) => c.type === t.type)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                          {(t.category_source === "ml" || t.category_source === "rules") && (
                            <Badge tone="blue">{SOURCE_LABEL[t.category_source]}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-500">{pm(t.payment_method)}</td>
                      <td className={`whitespace-nowrap py-2.5 pr-3 text-right font-medium tabular-nums ${t.type === "income" ? "text-emerald-600" : ""}`}>
                        {t.type === "income" ? "+" : "-"}
                        {formatMoney(t.amount, t.currency)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right">
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => {
                            setEditing(t);
                            setShowForm(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" className="px-2 py-1 text-red-600" onClick={() => remove(t)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
              {data.items.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-3"
                  onClick={() => {
                    setEditing(t);
                    setShowForm(true);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(t.date)} · {t.category_name ?? "Uncategorized"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${t.type === "income" ? "text-emerald-600" : ""}`}>
                    {t.type === "income" ? "+" : "-"}
                    {formatMoney(t.amount, t.currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
              <span>
                {offset + 1}-{Math.min(offset + PAGE, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit transaction" : "Add transaction"}>
        <TransactionForm
          key={editing?.id ?? "new"}
          initial={editing}
          categories={categories}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
        {editing && (
          <div className="mt-3 border-t border-zinc-200 pt-3 md:hidden dark:border-zinc-800">
            <Button
              variant="ghost"
              className="w-full text-red-600"
              onClick={() => {
                setShowForm(false);
                remove(editing);
              }}
            >
              Delete transaction
            </Button>
          </div>
        )}
      </Modal>
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import CSV">
        <CsvImport onDone={reload} />
      </Modal>
    </div>
  );
}
