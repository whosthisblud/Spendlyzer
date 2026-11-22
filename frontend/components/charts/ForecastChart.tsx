"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, monthLabel } from "@/lib/format";
import { AXIS, GRID, Legend, MoneyTooltip } from "./common";

export function ForecastChart({ data, currency }: { data: { month: string; actual: number | null; predicted: number | null }[]; currency: string }) {
  return (
    <div>
      <Legend items={[{ label: "Actual", color: "var(--series-1)" }, { label: "Predicted", color: "var(--series-2)", dashed: true }]} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS} />
          <YAxis tickFormatter={(v) => formatMoney(v, currency, true)} width={64} {...AXIS} />
          <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} content={<MoneyTooltip currency={currency} labelFormatter={monthLabel} />} />
          <Line dataKey="actual" name="Actual" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line dataKey="predicted" name="Predicted" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
