# Spendlyzer

Personal finance tracker with transaction categorization, spending analytics, anomaly detection, and expense forecasting.

## Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, Recharts
- Backend: Python, FastAPI, SQLAlchemy
- Database: PostgreSQL (Supabase)
- Auth: Supabase Auth (frontend), JWT verification (backend)
- ML: Scikit-learn, Pandas, NumPy
- Deployment: Vercel (frontend), Railway (backend)

## Features

**Authentication.** Registration and login through Supabase Auth with persistent, auto-refreshing sessions. The backend
verifies every request's access token (JWKS, or `SUPABASE_JWT_SECRET` for legacy HS256 projects) and scopes every query
to the token's user. Supabase RLS policies in `docs/schema.sql` enforce the same isolation at the database level.

**Transactions.** Add, edit, delete income and expenses with amount, currency, description, category, date and payment
method. CSV import validates every row, reports per-row errors, maps common bank headers, parses Indian date formats and
`₹1,250.00`-style amounts, and skips duplicates by fingerprint.

**Dashboard.** Income, expenses, balance, monthly income vs expenses, category breakdown, trend, budget utilization,
date-range filtering.

**Budgets.** Monthly overall or per-category limits, actual vs planned, warnings at 80% and when exceeded, copy from last
month.

**Machine learning** (details in `docs/ml.md`):
- Classification: per-user TF-IDF + logistic regression, cross-validated, used only when macro F1 >= 0.70. Falls back to
  keyword rules tuned for Indian merchants. Manual corrections become training labels.
- Anomaly detection: Isolation Forest on per-category spending features, with a synthetic-outlier recall check. Flags are
  reviewed (confirm or dismiss) by the user.
- Forecasting: model selection by rolling-origin backtest, predicted vs actual history, marked reliable only at
  MAPE <= 25%. Reports insufficient history instead of guessing.

**Insights.** Monthly summary, savings rate, top categories, significant category changes, budget observations and
anomaly counts, all computed from the user's own transactions.

INR is the default currency. Every transaction and budget stores its own ISO currency code; analytics are computed per
currency (the user's default unless specified).

## Project Structure

```
Spendlyzer/
├── frontend/
│   ├── app/                 # App Router pages: login, register, dashboard, transactions, budgets, insights
│   ├── components/          # UI primitives, forms, charts
│   ├── hooks/               # useAuth, useApi, useCategories
│   └── lib/                 # API client, Supabase client, types, formatting
├── backend/
│   ├── app/
│   │   ├── routes/          # FastAPI routers
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   ├── auth.py          # Supabase JWT verification
│   │   ├── config.py        # Settings and ML reliability thresholds
│   │   └── main.py          # App factory
│   ├── ml/
│   │   ├── classification/
│   │   ├── anomaly_detection/
│   │   └── forecasting/
│   ├── tests/
│   ├── requirements.txt
│   └── main.py
├── notebooks/
├── docs/                    # schema.sql, api.md, ml.md, sample CSV
├── .env.example
└── README.md
```

## Setup

### 1. Supabase

1. Create a Supabase project.
2. Run `docs/schema.sql` in the SQL editor (tables, indexes, RLS policies).
3. Under Authentication, enable email sign-in.
4. Collect the project URL, anon key and database connection string.

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # fill in values
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs. Without `DATABASE_URL` the backend falls back to a local SQLite file, which is
enough for development and tests.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # fill in values
npm run dev
```

Open http://localhost:3000.

### Tests

Backend (pytest):

```bash
cd backend
pytest
```

Covers auth rejection and token verification, concurrent first-request user provisioning, CRUD, validation,
cross-user isolation, CSV import and deduplication, budgets, dashboard aggregation, insights, and all three ML modules
including insufficient-data paths.

Frontend unit tests (Vitest + React Testing Library):

```bash
cd frontend
npm test
```

Covers formatting, the API client (auth header, error parsing, network failures), the auth hook and form, the
transaction form (create, edit, category suggestion, type filtering, server errors), CSV import results, budget bars
and the category chart.

End-to-end (Playwright):

```bash
cd frontend
npm run test:e2e
```

Starts the real FastAPI backend on a throwaway SQLite database and a production Next.js build, then drives the app in
Chromium at desktop and phone sizes. No Supabase project is needed: tests sign their own tokens and inject the session
where supabase-js stores it. Each test runs as a fresh user. Requires the backend virtualenv (`backend/venv`) or set
`PYTHON` to an interpreter with `backend/requirements.txt` installed. Use `npm run test:e2e:debug` to record traces.

## Environment Variables

Backend (`backend/.env`):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL, used to fetch JWKS for token verification |
| `SUPABASE_KEY` | Service or anon key |
| `SUPABASE_JWT_SECRET` | Only for projects on legacy HS256 JWT signing |
| `DATABASE_URL` | Postgres connection string |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `MODEL_DIR` | Where per-user classifier artifacts are stored |

Frontend (`frontend/.env.local`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_API_URL` | Backend base URL |

Never commit secrets or environment files.

## Deployment

- **Frontend (Vercel):** root directory `frontend`, set the three `NEXT_PUBLIC_*` variables.
- **Backend (Railway):** root directory `backend`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
  set backend variables and `CORS_ORIGINS` to the Vercel domain. Railway's filesystem is ephemeral, so classifier
  artifacts in `MODEL_DIR` are lost on redeploy unless a volume is mounted; retraining from the Insights page restores
  them.

## Development Priorities

### Phase 1: MVP

- [x] Project setup
- [x] Authentication
- [x] Database schema
- [x] Transaction CRUD
- [x] CSV import
- [x] Dashboard and analytics
- [x] Budget management

### Phase 2: Machine Learning

- [x] Transaction classification
- [x] Model evaluation
- [x] Anomaly detection
- [x] Expense forecasting
- [x] Prediction storage and API integration

### Phase 3: Insights and Deployment

- [x] Financial insights
- [x] Frontend/backend integration
- [x] Input validation and error handling
- [x] Authentication and authorization testing
- [x] Unit and integration tests
- [ ] Deployment

## License

MIT
