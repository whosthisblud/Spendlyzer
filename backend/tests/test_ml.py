from datetime import date, timedelta

import numpy as np
import pandas as pd

from ml.anomaly_detection.detector import detect_anomalies
from ml.classification.classifier import TransactionClassifier
from ml.classification.rules import match_rule
from ml.forecasting.forecaster import forecast_expenses

MERCHANTS = {
    "Food": ["swiggy order", "zomato dinner", "dominos pizza", "cafe coffee day"],
    "Transport": ["uber trip", "ola cab", "metro card recharge", "petrol pump hp"],
    "Shopping": ["amazon order", "flipkart purchase", "myntra clothes", "ajio shoes"],
}


def _labeled(n_per=20, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for cat, names in MERCHANTS.items():
        for _ in range(n_per):
            rows.append({"description": f"{rng.choice(names)} {rng.integers(100, 999)}", "type": "expense",
                         "amount": float(rng.uniform(100, 2000)), "category": cat})
    return pd.DataFrame(rows)


def test_rules():
    assert match_rule("UPI-SWIGGY-BANGALORE", "expense") == "Food & Dining"
    assert match_rule("NEFT SALARY NOV", "income") == "Salary"
    assert match_rule("random thing", "expense") is None


def test_classifier_insufficient_data():
    res = TransactionClassifier().fit(_labeled(3))
    assert res.status == "insufficient_data" and not res.reliable


def test_classifier_trains_and_evaluates():
    clf = TransactionClassifier()
    res = clf.fit(_labeled())
    assert res.status == "trained" and res.reliable
    assert res.metrics["macro_f1"] >= 0.9
    label, conf = clf.predict("zomato lunch", "expense", 300)
    assert label == "Food" and 0 < conf <= 1


def _expenses(n=120, seed=1):
    rng = np.random.default_rng(seed)
    start = date(2026, 1, 1)
    cats = ["Food", "Transport", "Groceries"]
    return pd.DataFrame([{
        "id": f"t{i}", "amount": float(rng.normal(500, 80)), "category": cats[i % 3],
        "date": start + timedelta(days=int(i * 2)),
    } for i in range(n)])


def test_anomaly_detection():
    df = _expenses()
    df.loc[10, "amount"] = 25000.0
    res = detect_anomalies(df)
    assert res.status == "ok"
    assert "t10" in set(res.flagged["id"])
    assert res.flagged.iloc[0]["id"] == "t10"
    assert res.metrics["synthetic_outlier_recall"] >= 0.8


def test_anomaly_insufficient():
    assert detect_anomalies(_expenses(10)).status == "insufficient_data"


def _monthly(values, start="2025-01"):
    months = pd.period_range(start, periods=len(values), freq="M")
    return pd.DataFrame({"date": [m.to_timestamp() for m in months], "amount": values}), months[-1] + 1


def test_forecast_insufficient_and_ok():
    df, cur = _monthly([10000, 12000])
    assert forecast_expenses(df, cur).status == "insufficient_data"
    assert forecast_expenses(pd.DataFrame(columns=["date", "amount"]), pd.Period("2026-11", "M")).status == "insufficient_data"

    df, cur = _monthly([20000 + 500 * i for i in range(12)])
    res = forecast_expenses(df, cur)
    assert res.status == "ok" and res.reliable
    assert res.method == "linear_trend"
    assert abs(res.predicted - 26000) < 100
    assert any(h["predicted"] is not None for h in res.history)


def test_ml_endpoints(client, a):
    assert client.get("/api/ml/forecast", headers=a).json()["status"] == "insufficient_data"
    assert client.get("/api/ml/anomalies", headers=a).json()["status"] == "insufficient_data"
    r = client.post("/api/ml/classifier/train", headers=a).json()
    assert r["status"] == "insufficient_data"
    p = client.post("/api/ml/classifier/predict", json={"description": "Uber to airport"}, headers=a).json()
    assert p["category"] == "Transport" and p["source"] == "rules"


def test_ml_end_to_end(client, a):
    cats = {c["name"]: c["id"] for c in client.get("/api/categories", headers=a).json() if c["type"] == "expense"}
    rng = np.random.default_rng(3)
    mapping = {"Food & Dining": "tiffin centre", "Transport": "shared auto", "Shopping": "local market stall"}
    d0 = date(2026, 5, 1)
    for i in range(60):
        cat = list(mapping)[i % 3]
        client.post("/api/transactions", json={
            "amount": str(round(float(rng.normal(400, 50)), 2)), "description": f"{mapping[cat]} {i}",
            "date": str(d0 + timedelta(days=i * 3)), "type": "expense", "category_id": cats[cat]}, headers=a)
    big = client.post("/api/transactions", json={"amount": "40000", "description": "tiffin centre catering",
                      "date": "2026-08-01", "type": "expense", "category_id": cats["Food & Dining"]}, headers=a).json()

    status = client.post("/api/ml/classifier/train", headers=a).json()
    assert status["reliable"], status
    p = client.post("/api/ml/classifier/predict", json={"description": "shared auto to college"}, headers=a).json()
    assert p["source"] == "model" and p["category"] == "Transport"

    rep = client.get("/api/ml/anomalies", headers=a).json()
    assert rep["status"] == "ok"
    assert big["id"] in {x["transaction_id"] for x in rep["anomalies"]}
    assert client.post(f"/api/ml/anomalies/{big['id']}/review", json={"is_anomaly": False}, headers=a).status_code == 204
    rep = client.get("/api/ml/anomalies", headers=a).json()
    assert big["id"] not in {x["transaction_id"] for x in rep["anomalies"]}

    fc = client.get("/api/ml/forecast", headers=a).json()
    assert fc["status"] == "ok" and fc["predicted"] is not None
