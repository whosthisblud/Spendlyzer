def _txn(**kw):
    base = {"amount": "250.50", "description": "Swiggy order", "date": "2026-10-05", "type": "expense",
            "payment_method": "upi"}
    base.update(kw)
    return base


def test_crud_and_auto_categorization(client, a):
    r = client.post("/api/transactions", json=_txn(), headers=a)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["currency"] == "INR"
    assert t["category_name"] == "Food & Dining"
    assert t["category_source"] == "rules"

    r = client.patch(f"/api/transactions/{t['id']}", json={"amount": "300"}, headers=a)
    assert r.json()["amount"] == "300.00"

    cats = client.get("/api/categories", headers=a).json()
    groceries = next(c for c in cats if c["name"] == "Groceries")
    r = client.patch(f"/api/transactions/{t['id']}", json={"category_id": groceries["id"]}, headers=a)
    assert r.json()["category_name"] == "Groceries"
    assert r.json()["category_source"] == "manual"

    lst = client.get("/api/transactions", headers=a).json()
    assert lst["total"] == 1
    assert client.delete(f"/api/transactions/{t['id']}", headers=a).status_code == 204
    assert client.get(f"/api/transactions/{t['id']}", headers=a).status_code == 404


def test_validation(client, a):
    assert client.post("/api/transactions", json=_txn(amount="-5"), headers=a).status_code == 422
    assert client.post("/api/transactions", json=_txn(description="   "), headers=a).status_code == 422
    assert client.post("/api/transactions", json=_txn(currency="rupees"), headers=a).status_code == 422
    assert client.post("/api/transactions", json=_txn(payment_method="cheque"), headers=a).status_code == 422


def test_category_type_mismatch(client, a):
    cats = client.get("/api/categories", headers=a).json()
    salary = next(c for c in cats if c["name"] == "Salary")
    r = client.post("/api/transactions", json=_txn(category_id=salary["id"]), headers=a)
    assert r.status_code == 422


def test_user_isolation(client, a, b):
    t = client.post("/api/transactions", json=_txn(), headers=a).json()
    assert client.get(f"/api/transactions/{t['id']}", headers=b).status_code == 404
    assert client.patch(f"/api/transactions/{t['id']}", json={"amount": "1"}, headers=b).status_code == 404
    assert client.delete(f"/api/transactions/{t['id']}", headers=b).status_code == 404
    assert client.get("/api/transactions", headers=b).json()["total"] == 0

    # B cannot attach A's category to their own transaction
    a_cat = client.get("/api/categories", headers=a).json()[0]
    r = client.post("/api/transactions", json=_txn(category_id=a_cat["id"]), headers=b)
    assert r.status_code == 404


def test_filters(client, a):
    client.post("/api/transactions", json=_txn(date="2026-09-01"), headers=a)
    client.post("/api/transactions", json=_txn(date="2026-10-01", description="Salary Oct", type="income",
                                               amount="50000"), headers=a)
    assert client.get("/api/transactions?type=income", headers=a).json()["total"] == 1
    assert client.get("/api/transactions?start=2026-10-01", headers=a).json()["total"] == 1
    assert client.get("/api/transactions?q=swiggy", headers=a).json()["total"] == 1
