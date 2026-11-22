export type TxnType = "income" | "expense";
export type PaymentMethod = "cash" | "upi" | "debit_card" | "credit_card" | "net_banking" | "wallet" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "net_banking", label: "Net banking" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
];

export interface Category {
  id: string;
  name: string;
  type: TxnType;
}

export interface Transaction {
  id: string;
  amount: string;
  currency: string;
  description: string;
  date: string;
  type: TxnType;
  payment_method: PaymentMethod | null;
  category_id: string | null;
  category_name: string | null;
  category_source: "manual" | "imported" | "ml" | "rules";
}

export interface TransactionInput {
  amount: string;
  currency: string;
  description: string;
  date: string;
  type: TxnType;
  payment_method: PaymentMethod | null;
  category_id: string | null;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface ImportResult {
  total_rows: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; error: string }[];
}

export interface BudgetStatus {
  id: string;
  category_id: string | null;
  category_name: string | null;
  monthly_limit: string;
  currency: string;
  period: string;
  spent: string;
  remaining: string;
  utilization: number;
  status: "ok" | "warning" | "exceeded";
}

export interface Dashboard {
  start: string;
  end: string;
  summary: {
    total_income: string;
    total_expense: string;
    balance: string;
    transaction_count: number;
    currency: string;
  };
  monthly: { month: string; income: string; expense: string }[];
  categories: { category: string; total: string; share: number }[];
  trend: { period: string; income: string; expense: string }[];
  budgets: BudgetStatus[];
}

export interface Insight {
  kind: string;
  severity: "info" | "positive" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface AnomalyReport {
  status: "ok" | "insufficient_data";
  message: string;
  evaluated_on: number;
  metrics: Record<string, unknown>;
  anomalies: {
    transaction_id: string;
    date: string;
    description: string;
    amount: string;
    currency: string;
    category: string | null;
    score: number;
    reason: string;
  }[];
}

export interface ForecastReport {
  status: "ok" | "insufficient_data";
  message: string;
  reliable: boolean;
  method: string | null;
  next_month: string | null;
  predicted: number | null;
  lower: number | null;
  upper: number | null;
  current_month_actual: number | null;
  metrics: Record<string, unknown>;
  history: { month: string; actual: number | null; predicted: number | null }[];
}

export interface ClassifierStatus {
  trained: boolean;
  reliable: boolean;
  status: string;
  metrics: Record<string, unknown>;
  message: string;
}
