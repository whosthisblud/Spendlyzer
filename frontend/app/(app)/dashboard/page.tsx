"use client";

import Link from "next/link";
import { useState } from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { CategoryChart } from "@/components/charts/CategoryChart";
import { MonthlyChart } from "@/components/charts/MonthlyChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { StatCard } from "@/components/StatCard";
import { Card, Empty, ErrorBox, Loading } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { qs } from "@/lib/api";
import { formatMoney, toISODate } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const now = new Date();
  const [range, setRange] = useState({ start: toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), end: toISODate(now) });
  const { data, error, loading } = useApi<Dashboard>(`/api/dashboard${qs(range)}`);
  const cur = data?.summary.currency ?? "INR";
  const empty = data && data.summary.transaction_count === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <DateRangeFilter start={range.start} end={range.end} onChange={(start, end) => setRange({ start, end })} />
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Income" value={formatMoney(data.summary.total_income, cur)} />
            <StatCard label="Expenses" value={formatMoney(data.summary.total_expense, cur)} />
            <StatCard label="Balance" value={formatMoney(data.summary.balance, cur)} tone={Number(data.summary.balance) >= 0 ? "green" : "red"} />
            <StatCard label="Transactions" value={String(data.summary.transaction_count)} sub={`Amounts in ${cur}`} />
          </div>
          {empty ? (
            <Card>
              <Empty
                title="No transactions in this range"
                hint="Add transactions manually or import a CSV from the Transactions page."
              />
              <div className="text-center">
                <Link href="/transactions" className="text-sm font-medium text-emerald-600 hover:underline">
                  Go to Transactions
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card title="Monthly income vs expenses" className="lg:col-span-3">
                <MonthlyChart data={data.monthly} currency={cur} />
              </Card>
              <Card title="Spending by category" className="lg:col-span-2">
                {data.categories.length ? <CategoryChart data={data.categories} currency={cur} /> : <Empty title="No expenses in range" />}
              </Card>
              <Card title="Trend" className="lg:col-span-3">
                <TrendChart data={data.trend} currency={cur} />
              </Card>
              <Card
                title="Budgets this month"
                className="lg:col-span-2"
                action={
                  <Link href="/budgets" className="text-xs font-medium text-emerald-600 hover:underline">
                    Manage
                  </Link>
                }
              >
                {data.budgets.length ? (
                  <div className="space-y-4">
                    {data.budgets.map((b) => (
                      <BudgetBar key={b.id} b={b} />
                    ))}
                  </div>
                ) : (
                  <Empty title="No budgets set" hint="Set monthly limits to track utilization." />
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
