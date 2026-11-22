"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, monthLabel } from "@/lib/format";
import { AXIS, GRID, Legend, MoneyTooltip } from "./common";

export function MonthlyChart({ data, currency }: { data: { month: string; income: string; expense: string }[]; currency: string }) {
  const rows = data.map((d) => ({ month: d.month, income: Number(d.income), expense: Number(d.expense) }));
  return (
    <div>
      <Legend items={[{ label: "Income", color: "var(--series-1)" }, { label: "Expenses", color: "var(--series-2)" }]} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} barGap={2} barCategoryGap="25%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS} />
          <YAxis tickFormatter={(v) => formatMoney(v, currency, true)} width={64} {...AXIS} />
          <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} content={<MoneyTooltip currency={currency} labelFormatter={monthLabel} />} />
          <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
