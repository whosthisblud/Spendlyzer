export function StatCard({ label, value, tone = "neutral", sub }: { label: string; value: string; tone?: "neutral" | "green" | "red"; sub?: string }) {
  const color = { neutral: "text-zinc-900 dark:text-zinc-50", green: "text-emerald-600", red: "text-red-600" }[tone];
  return (
    <div role="group" aria-label={label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
