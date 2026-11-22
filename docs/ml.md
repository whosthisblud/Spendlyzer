# Machine Learning

All models are per user and trained only on that user's data. Nothing is presented as reliable until it
passes an evaluation gate. Thresholds live in `backend/app/config.py` and can be overridden with env vars.

## Transaction classification (`backend/ml/classification`)

- Features: TF-IDF word (1-2) and char_wb (2-5) n-grams over the description, plus tokens for transaction type
  and a log-scale amount bucket.
- Model: balanced logistic regression.
- Training data: only user-provided labels (`category_source` in `manual`, `imported`). Model and rule
  predictions are excluded to avoid feedback loops. Manual corrections become training labels.
- Evaluation: stratified k-fold CV (k = min(5, smallest class count)). Reports accuracy and macro F1.
- Gate: >= 30 labeled samples, 2+ classes, macro F1 >= 0.70. Predictions also need confidence >= 0.50.
- Fallback: keyword rules tuned for Indian merchants (Swiggy, Zomato, BigBasket, IRCTC, Jio, ...).
- Storage: `MODEL_DIR/<user_id>/classifier.joblib` plus metrics JSON. Each automatic categorization is logged
  to `ml_predictions`.

## Anomaly detection (`backend/ml/anomaly_detection`)

- Isolation Forest (200 trees, contamination 5%) over per-category features: log ratio to the category
  median and a robust MAD z-score. Recurring fixed payments (rent) stay normal.
- Only high-side deviations (>= 1.5x the category median) are reported.
- Minimum 30 expense transactions in the user's default currency.
- Evaluation: synthetic outliers (6-12x real transactions, unseen during fit) are scored by the fitted model;
  `synthetic_outlier_recall` is returned with every run.
- Flags are stored in `ml_predictions`. Users confirm or dismiss them; dismissed transactions stop appearing.

## Expense forecasting (`backend/ml/forecasting`)

- Series: monthly expense totals for complete months, zero-filled.
- Candidates: mean of last 3 months, weighted average of last 6, linear trend over last 12 (needs 6 months).
- Selection: rolling-origin backtest over up to the last 6 months; lowest MAE wins.
- Output: forecast for the current month, an approximate 80% band from backtest residuals, and backtest
  predicted-vs-actual history for the chart.
- Gate: >= 3 months of history to forecast at all; marked reliable only with >= 3 backtest points and
  MAPE <= 25%.
