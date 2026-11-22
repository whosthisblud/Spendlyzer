"""CSV import with per-row validation and duplicate detection.

Required columns: date, amount, description
Optional columns: type (income|expense), category, currency, payment_method
If `type` is missing, negative amounts are treated as expenses and positive as income
unless every amount is positive, in which case all rows default to expense.
"""
import csv
import io
import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CategorySource, Transaction, TransactionType
from app.schemas.transaction import ImportResult, ImportRowError
from app.services import category_service
from app.services.transaction_service import auto_categorize, fingerprint

MAX_ROWS = 10_000
DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%y", "%Y/%m/%d", "%d %b %Y", "%d-%b-%Y", "%d %b %y")
PAYMENT_ALIASES = {
    "cash": "cash", "upi": "upi", "gpay": "upi", "phonepe": "upi", "paytm": "upi",
    "debit card": "debit_card", "debit_card": "debit_card", "debit": "debit_card",
    "credit card": "credit_card", "credit_card": "credit_card", "credit": "credit_card",
    "net banking": "net_banking", "netbanking": "net_banking", "net_banking": "net_banking", "neft": "net_banking",
    "imps": "net_banking", "wallet": "wallet", "other": "other",
}
HEADER_ALIASES = {
    "date": "date", "transaction date": "date", "txn date": "date", "value date": "date",
    "amount": "amount", "amt": "amount", "value": "amount",
    "description": "description", "narration": "description", "details": "description", "particulars": "description",
    "remarks": "description", "merchant": "description",
    "type": "type", "transaction type": "type", "cr/dr": "type", "dr/cr": "type",
    "category": "category", "currency": "currency",
    "payment_method": "payment_method", "payment method": "payment_method", "mode": "payment_method",
}


class CSVFormatError(ValueError):
    pass


def parse_date(raw: str) -> date:
    raw = raw.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date '{raw}' (use YYYY-MM-DD or DD/MM/YYYY)")


def parse_amount(raw: str) -> Decimal:
    cleaned = re.sub(r"[₹$€£,\s]|INR|Rs\.?", "", raw.strip(), flags=re.IGNORECASE)
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        value = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount '{raw}'") from exc
    if not value.is_finite():
        raise ValueError(f"Invalid amount '{raw}'")
    return -value if negative else value


def parse_type(raw: str | None, amount: Decimal, all_positive: bool) -> TransactionType:
    if raw:
        v = raw.strip().lower()
        if v in ("income", "credit", "cr", "in"):
            return TransactionType.income
        if v in ("expense", "debit", "dr", "out"):
            return TransactionType.expense
        raise ValueError(f"Invalid type '{raw}' (use income or expense)")
    if all_positive:
        return TransactionType.expense
    return TransactionType.expense if amount < 0 else TransactionType.income


def import_csv(db: Session, user_id: uuid.UUID, content: bytes, default_currency: str = "INR") -> ImportResult:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise CSVFormatError("CSV is empty or has no header row")
    header_map = {f: HEADER_ALIASES.get(f.strip().lower()) for f in reader.fieldnames}
    present = set(v for v in header_map.values() if v)
    missing = {"date", "amount", "description"} - present
    if missing:
        raise CSVFormatError(f"Missing required column(s): {', '.join(sorted(missing))}")

    rows = []
    for raw in reader:
        rows.append({header_map[k]: (v or "").strip() for k, v in raw.items() if k in header_map and header_map[k]})
        if len(rows) > MAX_ROWS:
            raise CSVFormatError(f"CSV exceeds {MAX_ROWS} rows")

    amounts = []
    for r in rows:
        try:
            amounts.append(parse_amount(r.get("amount", "")))
        except ValueError:
            amounts.append(None)
    all_positive = all(a is None or a >= 0 for a in amounts)

    existing = set(db.scalars(select(Transaction.fingerprint).where(Transaction.user_id == user_id)))
    errors: list[ImportRowError] = []
    imported = duplicates = 0
    to_categorize: list[Transaction] = []

    for i, r in enumerate(rows, start=2):  # row 1 is the header
        try:
            amount = amounts[i - 2]
            if amount is None:
                parse_amount(r.get("amount", ""))  # raises with a useful message
            if amount == 0:
                raise ValueError("Amount cannot be zero")
            txn_type = parse_type(r.get("type"), amount, all_positive)
            amount = abs(amount).quantize(Decimal("0.01"))
            if amount >= Decimal("1e12"):
                raise ValueError("Amount too large")
            txn_date = parse_date(r.get("date", ""))
            description = r.get("description", "").strip()[:255]
            if not description:
                raise ValueError("Description is required")
            currency = (r.get("currency") or default_currency).upper()
            if not re.fullmatch(r"[A-Z]{3}", currency):
                raise ValueError(f"Invalid currency '{currency}'")
            pm_raw = (r.get("payment_method") or "").lower()
            payment_method = PAYMENT_ALIASES.get(pm_raw, "other") if pm_raw else None
        except ValueError as exc:
            errors.append(ImportRowError(row=i, error=str(exc)))
            continue

        fp = fingerprint(txn_date, amount, description, txn_type.value, currency)
        if fp in existing:
            duplicates += 1
            continue
        existing.add(fp)

        category_id, source = None, CategorySource.imported
        if r.get("category"):
            category_id = category_service.get_or_create(db, user_id, r["category"], txn_type).id
        txn = Transaction(
            user_id=user_id, amount=amount, currency=currency, description=description, date=txn_date,
            type=txn_type, payment_method=payment_method, category_id=category_id,
            category_source=source, fingerprint=fp,
        )
        db.add(txn)
        if category_id is None:
            to_categorize.append(txn)
        imported += 1

    db.flush()
    for txn in to_categorize:
        auto_categorize(db, txn)
    db.commit()
    return ImportResult(
        total_rows=len(rows), imported=imported, duplicates=duplicates, failed=len(errors), errors=errors[:200]
    )
