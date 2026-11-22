CSV = """Date,Amount,Description,Type,Category,Payment Method
05/10/2026,"₹1,250.00",BigBasket order,expense,,UPI
2026-10-06,450,Uber ride,expense,Transport,credit card
2026-10-01,75000,October salary,income,,net banking
2026-10-07,abc,Broken row,expense,,
2026-13-01,100,Bad date,expense,,
05/10/2026,1250,BigBasket order,expense,,UPI
"""


def _upload(client, headers, content, name="t.csv"):
    return client.post("/api/transactions/import", files={"file": (name, content, "text/csv")}, headers=headers)


def test_import_validates_and_dedupes(client, a):
    r = _upload(client, a, CSV.encode())
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["total_rows"] == 6
    assert res["imported"] == 3
    assert res["duplicates"] == 1
    assert res["failed"] == 2
    assert {e["row"] for e in res["errors"]} == {5, 6}

    txns = client.get("/api/transactions", headers=a).json()["items"]
    bb = next(t for t in txns if t["description"] == "BigBasket order")
    assert bb["amount"] == "1250.00" and bb["category_name"] == "Groceries" and bb["payment_method"] == "upi"

    again = _upload(client, a, CSV.encode()).json()
    assert again["imported"] == 0 and again["duplicates"] == 4


def test_signed_amounts_without_type(client, a):
    csv = "date,amount,description\n2026-10-01,-500,Zomato\n2026-10-02,20000,Freelance payout\n"
    res = _upload(client, a, csv.encode()).json()
    assert res["imported"] == 2
    types = {t["description"]: t["type"] for t in client.get("/api/transactions", headers=a).json()["items"]}
    assert types == {"Zomato": "expense", "Freelance payout": "income"}


def test_missing_columns_and_wrong_file(client, a):
    assert _upload(client, a, b"foo,bar\n1,2\n").status_code == 422
    assert _upload(client, a, b"", name="x.csv").status_code == 422
    assert _upload(client, a, b"x", name="x.xlsx").status_code == 415
