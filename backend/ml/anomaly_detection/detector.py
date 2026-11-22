"""Isolation Forest over per-transaction spending features.

Features are relative to the user's own history within each category: log ratio to the
category median and a robust (MAD-based) z-score. Recurring fixed payments such as rent
therefore look normal, while a spend far above what is typical for its category stands out.
Only high-side deviations are reported, since overspending is what users need to review. Detection quality is sanity-checked by
injecting synthetic outliers and measuring how many the model recovers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

MODEL_VERSION = "iforest-v2"
MIN_RATIO = 1.5  # report only spends at least 1.5x the category median


@dataclass
class DetectionResult:
    status: str  # ok | insufficient_data
    flagged: pd.DataFrame  # columns: id, score, reason
    metrics: dict[str, Any] = field(default_factory=dict)
    message: str = ""


def _features(df: pd.DataFrame) -> np.ndarray:
    amount = df["amount"].astype(float)
    cat = df["category"].fillna("Uncategorized")
    median = amount.groupby(cat).transform("median").replace(0, np.nan).fillna(amount.median())
    mad = (amount - median).abs().groupby(cat).transform("median")
    mad = mad.where(mad > 0, median * 0.1)  # categories with identical amounts (e.g. rent)
    return np.column_stack([
        np.log(amount / median),
        np.clip((amount - median) / (1.4826 * mad), -10, 10),
    ])


def _make_model(contamination: float) -> IsolationForest:
    return IsolationForest(n_estimators=200, contamination=contamination, random_state=42)


def _synthetic_recall(df: pd.DataFrame, model: IsolationForest, n_inject: int = 10) -> float:
    """Share of synthetic 6-12x outliers (unseen during fit) that the fitted model flags."""
    rng = np.random.default_rng(7)
    sample = df.sample(n=min(n_inject, len(df)), random_state=7, replace=False).copy()
    sample["amount"] = sample["amount"].astype(float) * rng.uniform(6, 12, size=len(sample))
    combined = pd.concat([df, sample], ignore_index=True)
    injected = _features(combined)[len(df):]
    return float((model.predict(injected) == -1).mean())


def detect_anomalies(df: pd.DataFrame, min_samples: int = 30, contamination: float = 0.05) -> DetectionResult:
    """df columns: id, amount, category, date (expense transactions only)."""
    empty = pd.DataFrame(columns=["id", "score", "reason"])
    if len(df) < min_samples:
        return DetectionResult(
            "insufficient_data", empty, {"samples": int(len(df))},
            f"Need at least {min_samples} expense transactions to learn your spending pattern (have {len(df)}).",
        )

    df = df.reset_index(drop=True)
    X = _features(df)
    model = _make_model(contamination).fit(X)
    pred = model.predict(X)
    scores = -model.score_samples(X)  # higher = more anomalous

    amount = df["amount"].astype(float)
    cat = df["category"].fillna("Uncategorized")
    cat_median = amount.groupby(cat).transform("median")

    rows = []
    for i in np.where(pred == -1)[0]:
        ratio = amount[i] / cat_median[i] if cat_median[i] else float("nan")
        if not ratio >= MIN_RATIO:
            continue
        reason = f"{ratio:.1f}x your typical {cat[i]} spend"
        rows.append({"id": df.loc[i, "id"], "score": round(float(scores[i]), 4), "reason": reason})

    flagged = pd.DataFrame(rows, columns=["id", "score", "reason"]).sort_values("score", ascending=False)
    metrics = {
        "samples": int(len(df)),
        "flagged": int(len(flagged)),
        "contamination": contamination,
        "synthetic_outlier_recall": round(_synthetic_recall(df, model), 3),
        "model_version": MODEL_VERSION,
    }
    return DetectionResult(
        "ok", flagged, metrics,
        "Flagged transactions deviate from your history. Review them; they are not necessarily errors.",
    )
