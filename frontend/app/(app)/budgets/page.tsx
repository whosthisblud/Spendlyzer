"use client";

import { useState, type FormEvent } from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Select } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import { api, qs } from "@/lib/api";
import { firstOfMonth } from "@/lib/format";
import type { BudgetStatus } from "@/lib/types";

export default function BudgetsPage() {
  const [month, setMonth] = useState(firstOfMonth().slice(0, 7));
  const period = `${month}-01`;
  const { data, error, loading, reload } = useApi<BudgetStatus[]>(`/api/budgets/status${qs({ period })}`);
  const { categories } = useCategories();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category_id: "", monthly_limit: "" });
  const [formError, setFormError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/api/budgets", {
        method: "POST",
        body: JSON.stringify({ category_id: form.category_id || null, monthly_limit: form.monthly_limit, period }),
      });
      setOpen(false);
      setForm({ category_id: "", monthly_limit: "" });
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save budget");
    }
  }

  async function edit(b: BudgetStatus) {
    const v = prompt(`New monthly limit for ${b.category_name}`, b.monthly_limit);
    if (!v) return;
    try {
      await api(`/api/budgets/${b.id}`, { method: "PATCH", body: JSON.stringify({ monthly_limit: v }) });
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(b: BudgetStatus) {
    if (!confirm(`Delete the ${b.category_name} budget?`)) return;
    await api(`/api/budgets/${b.id}`, { method: "DELETE" });
    reload();
  }

  async function copyFromPrevious() {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevPeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
    const prevBudgets = await api<BudgetStatus[]>(`/api/budgets/status${qs({ period: prevPeriod })}`);
    for (const b of prevBudgets) {
      await api("/api/budgets", {
        method: "POST",
        body: JSON.stringify({ category_id: b.category_id, monthly_limit: b.monthly_limit, currency: b.currency, period }),
      }).catch(() => undefined); // skip ones that already exist
    }
    reload();
  }

  const alerts = (data ?? []).filter((b) => b.status !== "ok");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <div className="flex flex-wrap gap-2">
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" aria-label="Month" />
          <Button variant="secondary" onClick={copyFromPrevious}>
            Copy last month
          </Button>
          <Button onClick={() => setOpen(true)}>New budget</Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">! Budget warnings</p>
          <ul className="mt-1 list-inside list-disc">
            {alerts.map((b) => (
              <li key={b.id}>
                {b.category_name}: {Math.round(b.utilization * 100)}% used{b.status === "exceeded" ? " (over limit)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        {error && <ErrorBox message={error} />}
        {loading && !data && <Loading />}
        {data && data.length === 0 && <Empty title="No budgets for this month" hint="Create an overall or per-category monthly limit." />}
        {data && data.length > 0 && (
          <div className="space-y-5">
            {data.map((b) => (
              <BudgetBar key={b.id} b={b}>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => edit(b)}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => remove(b)}>
                    Delete
                  </Button>
                </div>
              </BudgetBar>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New budget">
        <form onSubmit={create} className="space-y-4">
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Overall (all expenses)</option>
              {categories
                .filter((c) => c.type === "expense")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Monthly limit (INR)">
            <Input required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" value={form.monthly_limit} onChange={(e) => setForm({ ...form, monthly_limit: e.target.value })} />
          </Field>
          {formError && <ErrorBox message={formError} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
