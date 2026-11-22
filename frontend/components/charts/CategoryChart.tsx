"use client";

import { formatMoney } from "@/lib/format";

/** Horizontal bars, sorted by spend. Rendered in HTML so labels never collide. */
export function CategoryChart({ data, currency, limit = 8 }: { data: { category: string; total: string; share: number }[]; currency: string; limit?: number }) {
  let rows = data.map((d) => ({ ...d, value: Number(d.total) }));
  if (rows.length > limit) {
    const rest = rows.slice(limit - 1);
    rows = [
      ...rows.slice(0, limit - 1),
      { category: `Other (${rest.length})`, total: "", share: rest.reduce((s, r) => s + r.share, 0), value: rest.reduce((s, r) => s + r.value, 0) },
    ];
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.category} title={`${r.category}: ${formatMoney(r.value, currency)} (${(r.share * 100).toFixed(1)}%)`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate text-zinc-700 dark:text-zinc-300">{r.category}</span>
            <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatMoney(r.value, currency)} <span className="text-xs text-zinc-500">{(r.share * 100).toFixed(0)}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: "var(--series-2)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
