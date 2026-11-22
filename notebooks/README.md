# Notebooks

Exploration and model evaluation. Notebooks import from `backend/ml` so experiments use the same code as the API:

```python
import sys; sys.path.append("../backend")
from ml.classification.classifier import TransactionClassifier
from ml.anomaly_detection.detector import detect_anomalies
from ml.forecasting.forecaster import forecast_expenses
```

Never commit real transaction data. Use `docs/sample_transactions.csv` or synthetic data.
