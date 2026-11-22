"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatMoney, monthLabel } from "@/lib/format";
import { AXIS, GRID, Legend, MoneyTooltip } from "./common";

const fmtPeriod = (p: string) => (p.length === 7 ? monthLabel(p) : formatDate(p));

export function TrendChart({ data, currency }: { data: { period: string; income: string; expense: string }[]; currency: string }) {
  const rows = data.map((d) => ({ period: d.period, income: Number(d.income), expense: Number(d.expense) }));
  return (
    <div>
      <Legend items={[{ label: "Income", color: "var(--series-1)" }, { label: "Expenses", color: "var(--series-2)" }]} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="period" tickFormatter={(p) => fmtPeriod(p).replace(/ \d{4}$/, "")} minTickGap={24} {...AXIS} />
          <YAxis tickFormatter={(v) => formatMoney(v, currency, true)} width={64} {...AXIS} />
          <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} content={<MoneyTooltip currency={currency} labelFormatter={fmtPeriod} />} />
          <Line dataKey="income" name="Income" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line dataKey="expense" name="Expenses" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
