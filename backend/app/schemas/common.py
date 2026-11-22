from typing import Literal

PaymentMethod = Literal["cash", "upi", "debit_card", "credit_card", "net_banking", "wallet", "other"]
CurrencyCode = str  # validated with CURRENCY_PATTERN
CURRENCY_PATTERN = r"^[A-Z]{3}$"
