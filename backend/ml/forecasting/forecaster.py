"""Monthly expense forecasting.

Candidate models are compared with a rolling-origin backtest and the one with the
lowest MAE is used. Backtest predictions are returned alongside actuals so the UI
can show predicted vs actual. Insufficient history is reported, not papered over.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

MODEL_VERSION = "forecast-backtest-v1"


def _mean_last3(y: np.ndarray) -> float:
    return float(np.mean(y[-3:]))


def _weighted_avg(y: np.ndarray) -> float:
    w = np.arange(1, min(len(y), 6) + 1, dtype=float)
    return float(np.average(y[-len(w):], weights=w))


def _linear_trend(y: np.ndarray) -> float:
    window = y[-12:]
    x = np.arange(len(window)).reshape(-1, 1)
    model = LinearRegression().fit(x, window)
    return float(max(model.predict([[len(window)]])[0], 0.0))


MODELS: dict[str, tuple[int, Callable[[np.ndarray], float]]] = {
    # name: (minimum history required, predictor)
    "mean_last_3": (3, _mean_last3),
    "weighted_average": (3, _weighted_avg),
    "linear_trend": (6, _linear_trend),
}


@dataclass
class ForecastResult:
    status: str
    reliable: bool
    method: str | None = None
    next_month: str | None = None
    predicted: float | None = None
    lower: float | None = None
    upper: float | None = None
    history: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    message: str = ""


def monthly_series(df: pd.DataFrame, up_to: pd.Period) -> pd.Series:
    """Sum expenses per month for complete months strictly before `up_to`, zero-filled."""
    if df.empty:
        return pd.Series(dtype=float)
    months = pd.to_datetime(df["date"]).dt.to_period("M")
    s = df.assign(month=months).groupby("month")["amount"].sum().astype(float)
    s = s[s.index < up_to]
    if s.empty:
        return s
    full = pd.period_range(s.index.min(), up_to - 1, freq="M")
    return s.reindex(full, fill_value=0.0)


def forecast_expenses(
    df: pd.DataFrame,
    current_month: pd.Period,
    min_months: int = 3,
    max_reliable_mape: float = 0.25,
) -> ForecastResult:
    """df columns: date, amount (expenses only). Forecasts `current_month`."""
    series = monthly_series(df, current_month)
    y = series.to_numpy()
    if len(y) < min_months:
        return ForecastResult(
            "insufficient_data", False,
            history=[{"month": str(m), "actual": float(v), "predicted": None} for m, v in series.items()],
            metrics={"months_of_history": int(len(y))},
            message=f"Need at least {min_months} complete months of expenses to forecast (have {len(y)}).",
        )

    # Rolling-origin backtest over up to the last 6 months.
    errors: dict[str, list[tuple[float, float]]] = {}
    backtest_start = max(3, len(y) - 6)
    for name, (min_hist, fn) in MODELS.items():
        pairs = []
        for t in range(max(backtest_start, min_hist), len(y)):
            pairs.append((y[t], fn(y[:t])))
        if pairs:
            errors[name] = pairs

    if errors:
        mae = {k: float(np.mean([abs(a - p) for a, p in v])) for k, v in errors.items()}
        best = min(mae, key=mae.get)
        pairs = errors[best]
        actuals = np.array([a for a, _ in pairs])
        preds = np.array([p for _, p in pairs])
        nonzero = actuals > 0
        mape = float(np.mean(np.abs(actuals[nonzero] - preds[nonzero]) / actuals[nonzero])) if nonzero.any() else None
        resid_std = float(np.std(actuals - preds)) if len(pairs) > 1 else float(np.std(y) or 0)
    else:  # exactly min_months of data: no room to backtest
        best, mae, mape, pairs = "mean_last_3", {}, None, []
        resid_std = float(np.std(y))

    predicted = MODELS[best][1](y)
    reliable = mape is not None and len(pairs) >= 3 and mape <= max_reliable_mape

    bt_months = list(series.index[len(y) - len(pairs):]) if pairs else []
    bt_lookup = {str(m): p for m, (_, p) in zip(bt_months, pairs)}
    history = [
        {"month": str(m), "actual": round(float(v), 2),
         "predicted": round(bt_lookup[str(m)], 2) if str(m) in bt_lookup else None}
        for m, v in series.items()
    ]

    message = (
        f"Forecast backtested with MAPE {mape:.0%}." if reliable
        else "Forecast is indicative only: not enough history or backtest error is above the reliability bar."
    )
    return ForecastResult(
        status="ok",
        reliable=reliable,
        method=best,
        next_month=str(current_month),
        predicted=round(predicted, 2),
        lower=round(max(predicted - 1.28 * resid_std, 0.0), 2),
        upper=round(predicted + 1.28 * resid_std, 2),
        history=history,
        metrics={
            "months_of_history": int(len(y)),
            "backtest_points": len(pairs),
            "mae": {k: round(v, 2) for k, v in mae.items()},
            "mape": round(mape, 4) if mape is not None else None,
            "model_version": MODEL_VERSION,
        },
        message=message,
    )
