"use client";

import { toISODate } from "@/lib/format";
import { Input } from "./ui";

const PRESETS: { label: string; months: number }[] = [
  { label: "This month", months: 0 },
  { label: "3M", months: 2 },
  { label: "6M", months: 5 },
  { label: "12M", months: 11 },
];

export function DateRangeFilter({ start, end, onChange }: { start: string; end: string; onChange: (s: string, e: string) => void }) {
  const preset = (months: number) => {
    const now = new Date();
    onChange(toISODate(new Date(now.getFullYear(), now.getMonth() - months, 1)), toISODate(now));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => preset(p.months)} className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input type="date" value={start} max={end} onChange={(e) => onChange(e.target.value, end)} className="w-auto py-1.5" aria-label="Start date" />
        <span className="text-zinc-400">to</span>
        <Input type="date" value={end} min={start} onChange={(e) => onChange(start, e.target.value)} className="w-auto py-1.5" aria-label="End date" />
      </div>
    </div>
  );
}
