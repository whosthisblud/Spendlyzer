"use client";

import { useState } from "react";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { Badge, Button, Card, Empty, ErrorBox, Input, Loading } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { api, qs } from "@/lib/api";
import { firstOfMonth, formatDate, formatMoney } from "@/lib/format";
import type { AnomalyReport, ClassifierStatus, ForecastReport, Insight } from "@/lib/types";

const SEVERITY = {
  info: { tone: "neutral", label: "Info" },
  positive: { tone: "green", label: "Good" },
  warning: { tone: "amber", label: "Watch" },
  critical: { tone: "red", label: "Alert" },
} as const;

const pct = (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(0)}%` : "n/a");

export default function InsightsPage() {
  const [month, setMonth] = useState(firstOfMonth().slice(0, 7));
  const insights = useApi<{ insights: Insight[]; currency: string }>(`/api/insights${qs({ period: `${month}-01` })}`);
  const forecast = useApi<ForecastReport>("/api/ml/forecast");
  const anomalies = useApi<AnomalyReport>("/api/ml/anomalies");
  const classifier = useApi<ClassifierStatus>("/api/ml/classifier");
  const [training, setTraining] = useState(false);

  async function train() {
    setTraining(true);
    try {
      classifier.setData(await api<ClassifierStatus>("/api/ml/classifier/train", { method: "POST" }));
    } finally {
      setTraining(false);
    }
  }

  async function review(id: string, isAnomaly: boolean) {
    await api(`/api/ml/anomalies/${id}/review`, { method: "POST", body: JSON.stringify({ is_anomaly: isAnomaly }) });
    anomalies.setData((d) => (d ? { ...d, anomalies: d.anomalies.filter((a) => a.transaction_id !== id) } : d));
  }

  const f = forecast.data;
  const cur = insights.data?.currency ?? "INR";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Insights</h1>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" aria-label="Month" />
      </div>

      <Card title="Observations">
        {insights.error && <ErrorBox message={insights.error} />}
        {insights.loading && !insights.data && <Loading />}
        {insights.data && (
          <ul className="space-y-3">
            {insights.data.insights.map((i, idx) => (
              <li key={idx} className="flex gap-3">
                <div className="w-14 shrink-0 pt-0.5">
                  <Badge tone={SEVERITY[i.severity].tone}>{SEVERITY[i.severity].label}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Expense forecast"
          action={f?.status === "ok" && <Badge tone={f.reliable ? "green" : "amber"}>{f.reliable ? "Backtested" : "Indicative"}</Badge>}
        >
          {forecast.error && <ErrorBox message={forecast.error} />}
          {forecast.loading && !f && <Loading />}
          {f && f.status === "insufficient_data" && <Empty title="Not enough history yet" hint={f.message} />}
          {f && f.status === "ok" && (
            <>
              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <p className="text-xs text-zinc-500">Predicted this month</p>
                  <p className="text-lg font-semibold tabular-nums">{formatMoney(f.predicted, cur)}</p>
                  <p className="text-xs text-zinc-500">
                    range {formatMoney(f.lower, cur, true)} to {formatMoney(f.upper, cur, true)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Spent so far</p>
                  <p className="text-lg font-semibold tabular-nums">{formatMoney(f.current_month_actual, cur)}</p>
                </div>
              </div>
              <ForecastChart data={f.history} currency={cur} />
              <p className="mt-2 text-xs text-zinc-500">
                {f.message} Method: {f.method?.replace(/_/g, " ")}.
              </p>
            </>
          )}
        </Card>

        <Card title="Flagged transactions">
          {anomalies.error && <ErrorBox message={anomalies.error} />}
          {anomalies.loading && !anomalies.data && <Loading />}
          {anomalies.data?.status === "insufficient_data" && <Empty title="Not enough history yet" hint={anomalies.data.message} />}
          {anomalies.data?.status === "ok" && (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                {anomalies.data.message} Checked {anomalies.data.evaluated_on} expenses; synthetic outlier recall{" "}
                {pct(anomalies.data.metrics.synthetic_outlier_recall)}.
              </p>
              {anomalies.data.anomalies.length === 0 ? (
                <Empty title="Nothing unusual" />
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {anomalies.data.anomalies.map((a) => (
                    <li key={a.transaction_id} className="py-3">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.description}</p>
                          <p className="text-xs text-zinc-500">
                            {formatDate(a.date)} · {a.category ?? "Uncategorized"} · {a.reason}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(a.amount, a.currency)}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => review(a.transaction_id, true)}>
                          Confirm unusual
                        </Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => review(a.transaction_id, false)}>
                          Looks normal
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="Category classifier"
        action={
          <Button variant="secondary" onClick={train} disabled={training}>
            {training ? "Training..." : "Train on my data"}
          </Button>
        }
      >
        {classifier.data && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={classifier.data.reliable ? "green" : classifier.data.trained ? "amber" : "neutral"}>
                {classifier.data.reliable ? "Reliable" : classifier.data.trained ? "Below bar" : "Untrained"}
              </Badge>
              <span className="text-zinc-600 dark:text-zinc-400">{classifier.data.message}</span>
            </div>
            {"macro_f1" in classifier.data.metrics && (
              <p className="text-xs text-zinc-500">
                {String(classifier.data.metrics.samples)} labeled samples, {String(classifier.data.metrics.classes)} categories, cross-validated accuracy{" "}
                {pct(classifier.data.metrics.accuracy)}, macro F1 {pct(classifier.data.metrics.macro_f1)}.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              Trains only on categories you set or imported. Correct categories on the Transactions page to improve it.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
