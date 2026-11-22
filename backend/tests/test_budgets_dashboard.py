def _cat(client, h, name):
    return next(c for c in client.get("/api/categories", headers=h).json() if c["name"] == name)


def _add(client, h, amount, desc, d, typ="expense", **kw):
    r = client.post("/api/transactions", json={"amount": amount, "description": desc, "date": d, "type": typ, **kw},
                    headers=h)
    assert r.status_code == 201, r.text


def test_budget_status(client, a, b):
    food = _cat(client, a, "Food & Dining")
    r = client.post("/api/budgets", json={"category_id": food["id"], "monthly_limit": "1000", "period": "2026-10-15"},
                    headers=a)
    assert r.status_code == 201 and r.json()["period"] == "2026-10-01"
    assert client.post("/api/budgets", json={"category_id": food["id"], "monthly_limit": "5", "period": "2026-10-01"},
                       headers=a).status_code == 409
    client.post("/api/budgets", json={"monthly_limit": "5000", "period": "2026-10-01"}, headers=a)

    _add(client, a, "850", "Zomato dinner", "2026-10-10")
    status = {s["category_name"]: s for s in client.get("/api/budgets/status?period=2026-10-01", headers=a).json()}
    assert status["Food & Dining"]["status"] == "warning"
    assert status["Overall"]["status"] == "ok"
    _add(client, a, "300", "Swiggy", "2026-10-11")
    status = {s["category_name"]: s for s in client.get("/api/budgets/status?period=2026-10-01", headers=a).json()}
    assert status["Food & Dining"]["status"] == "exceeded"

    assert client.get("/api/budgets/status?period=2026-10-01", headers=b).json() == []
    salary = _cat(client, a, "Salary")
    assert client.post("/api/budgets", json={"category_id": salary["id"], "monthly_limit": "1", "period": "2026-10-01"},
                       headers=a).status_code == 422


def test_dashboard_empty_and_populated(client, a):
    d = client.get("/api/dashboard?start=2026-08-01&end=2026-10-31", headers=a).json()
    assert d["summary"]["transaction_count"] == 0 and d["categories"] == []
    assert len(d["monthly"]) == 3

    _add(client, a, "60000", "Salary", "2026-10-01", "income")
    _add(client, a, "15000", "Rent October", "2026-10-02")
    _add(client, a, "5000", "Amazon purchase", "2026-09-15")
    _add(client, a, "100", "Foreign thing", "2026-10-03", currency="USD")
    d = client.get("/api/dashboard?start=2026-08-01&end=2026-10-31", headers=a).json()
    assert d["summary"]["total_income"] == "60000.00"
    assert d["summary"]["total_expense"] == "20000.00"
    assert d["summary"]["balance"] == "40000.00"
    assert d["categories"][0]["category"] == "Rent"
    oct_ = next(m for m in d["monthly"] if m["month"] == "2026-10")
    assert oct_["expense"] == "15000.00"


def test_insights(client, a):
    assert client.get("/api/insights?period=2026-10-01", headers=a).json()["insights"][0]["kind"] == "info"
    _add(client, a, "60000", "Salary", "2026-10-01", "income")
    _add(client, a, "2000", "Swiggy", "2026-09-05")
    _add(client, a, "6000", "Zomato party", "2026-10-05")
    kinds = {i["kind"] for i in client.get("/api/insights?period=2026-10-01", headers=a).json()["insights"]}
    assert {"summary", "savings", "top_category", "change"} <= kinds
