"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { toISODate } from "@/lib/format";
import { PAYMENT_METHODS, type Category, type Transaction, type TransactionInput, type TxnType } from "@/lib/types";
import { Button, ErrorBox, Field, Input, Select } from "./ui";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

export function TransactionForm({
  initial,
  categories,
  onSaved,
  onCancel,
}: {
  initial?: Transaction | null;
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TransactionInput>({
    amount: initial?.amount ?? "",
    currency: initial?.currency ?? "INR",
    description: initial?.description ?? "",
    date: initial?.date ?? toISODate(new Date()),
    type: initial?.type ?? "expense",
    payment_method: initial?.payment_method ?? "upi",
    category_id: initial?.category_id ?? null,
  });
  const [suggestion, setSuggestion] = useState<{ name: string; source: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TransactionInput>(k: K, v: TransactionInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const options = categories.filter((c) => c.type === form.type);

  // Live category suggestion while typing (only when no category chosen).
  useEffect(() => {
    if (form.category_id || form.description.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ category: string | null; source: string }>("/api/ml/classifier/predict", {
          method: "POST",
          body: JSON.stringify({ description: form.description, type: form.type, amount: form.amount || null }),
        });
        setSuggestion(r.category ? { name: r.category, source: r.source } : null);
      } catch {
        setSuggestion(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.description, form.type, form.amount, form.category_id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({ ...form, amount: form.amount.trim() });
      if (initial) await api(`/api/transactions/${initial.id}`, { method: "PATCH", body });
      else await api("/api/transactions", { method: "POST", body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {(["expense", "income"] as TxnType[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setForm((f) => ({ ...f, type: t, category_id: null }))}
            className={`rounded-md py-1.5 text-sm font-medium capitalize ${form.type === t ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Amount">
            <Input required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" placeholder="0.00" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Field>
        </div>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Input required maxLength={255} placeholder="e.g. Swiggy order" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Payment method">
          <Select value={form.payment_method ?? ""} onChange={(e) => set("payment_method", (e.target.value || null) as TransactionInput["payment_method"])}>
            <option value="">Not specified</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Category">
        <Select value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)}>
          <option value="">Auto-categorize</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {suggestion && (
        <p className="text-xs text-zinc-500">
          Suggested: <span className="font-medium text-zinc-700 dark:text-zinc-300">{suggestion.name}</span> ({suggestion.source === "model" ? "your trained model" : "keyword rules"}).{" "}
          <button
            type="button"
            className="font-medium text-emerald-600 hover:underline"
            onClick={() => {
              const c = options.find((o) => o.name === suggestion.name);
              if (c) set("category_id", c.id);
            }}
          >
            Use it
          </button>
        </p>
      )}
      {error && <ErrorBox message={error} />}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}

