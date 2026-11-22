import type { BudgetStatus } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { Badge } from "./ui";

const TONE = { ok: "green", warning: "amber", exceeded: "red" } as const;
const LABEL = { ok: "On track", warning: "Near limit", exceeded: "Exceeded" } as const;
const BAR = { ok: "bg-emerald-500", warning: "bg-amber-500", exceeded: "bg-red-500" } as const;

export function BudgetBar({ b, children }: { b: BudgetStatus; children?: React.ReactNode }) {
  const pct = Math.min(b.utilization * 100, 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{b.category_name}</span>
          <Badge tone={TONE[b.status]}>
            {b.status !== "ok" && "! "}
            {LABEL[b.status]}
          </Badge>
        </div>
        {children}
      </div>
      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-2 rounded-full ${BAR[b.status]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs tabular-nums text-zinc-500">
        {formatMoney(b.spent, b.currency)} of {formatMoney(b.monthly_limit, b.currency)} ({Math.round(b.utilization * 100)}%)
        {Number(b.remaining) >= 0 ? `, ${formatMoney(b.remaining, b.currency)} left` : `, ${formatMoney(-Number(b.remaining), b.currency)} over`}
      </p>
    </div>
  );
}
