"use client";

import { formatMoney } from "@/lib/format";

export const AXIS = { stroke: "var(--chart-axis)", fontSize: 12, tickLine: false, axisLine: false } as const;
export const GRID = { stroke: "var(--chart-grid)", strokeDasharray: "0", vertical: false } as const;

type Payload = { name?: string; value?: number | string; color?: string; dataKey?: string | number };

export function MoneyTooltip({
  active,
  payload,
  label,
  currency = "INR",
  labelFormatter,
}: {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  currency?: string;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-sm" style={{ background: "var(--tooltip-bg)", borderColor: "var(--tooltip-border)" }}>
      <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-200">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(Number(p.value), currency)}</span>
          </div>
        ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color, height: 3 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
