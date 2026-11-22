# API Reference

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Interactive docs at `/docs`.

Every `/api/*` route requires `Authorization: Bearer <supabase access token>`. The backend verifies the token
(JWKS for asymmetric Supabase keys, `SUPABASE_JWT_SECRET` for legacy HS256), provisions the user row on first
request with default categories, and scopes every query to that user.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / PATCH | `/api/me` | Profile, default currency |
| GET | `/api/transactions` | List. Filters: `start`, `end`, `type`, `category_id`, `uncategorized`, `q`, `limit`, `offset` |
| POST | `/api/transactions` | Create. Uncategorized rows are auto-categorized |
| GET / PATCH / DELETE | `/api/transactions/{id}` | Read, update (setting `category_id` = manual correction), delete |
| POST | `/api/transactions/import` | Multipart CSV upload. Returns imported / duplicates / failed with row errors |
| GET / POST | `/api/categories` | List, create |
| DELETE | `/api/categories/{id}` | Delete (transactions become uncategorized) |
| GET / POST | `/api/budgets` | List (`period`), create |
| GET | `/api/budgets/status` | Spent, remaining, utilization, `ok` / `warning` (>= 80%) / `exceeded` |
| PATCH / DELETE | `/api/budgets/{id}` | Update limit, delete |
| GET | `/api/dashboard` | Summary, monthly, categories, trend, budgets. `start`, `end`, `currency` |
| GET | `/api/ml/classifier` | Classifier status and evaluation metrics |
| POST | `/api/ml/classifier/train` | Train on the user's own labeled transactions |
| POST | `/api/ml/classifier/predict` | Predict category for a description |
| GET | `/api/ml/anomalies` | Run Isolation Forest, return flagged transactions |
| POST | `/api/ml/anomalies/{id}/review` | Confirm or dismiss a flag |
| GET | `/api/ml/forecast` | Current-month expense forecast with backtest history |
| GET | `/api/insights` | Insights for `period` (any date in the month) |

## CSV format

Required columns: `date`, `amount`, `description`. Optional: `type`, `category`, `currency`, `payment_method`.
Common bank headers (`Narration`, `Particulars`, `Txn Date`, `Cr/Dr`) are mapped automatically.

- Dates: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD Mon YYYY`.
- Amounts: `₹`, `Rs`, commas and `(1,000)` negatives are handled.
- Without a `type` column, negative amounts are expenses and positive are income; if all amounts are positive,
  all rows are expenses.
- Duplicates are detected by a fingerprint of date, amount, normalized description, type and currency, against
  both existing transactions and earlier rows in the same file.
- Unknown category names are created. Rows without a category are auto-categorized.
- Limits: 5 MB, 10,000 rows.

See `docs/sample_transactions.csv`.
