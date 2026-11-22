const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: string | number | null | undefined, currency = "INR", compact = false): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  const key = `${currency}-${compact}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: compact ? 1 : 2,
        notation: compact ? "compact" : "standard",
      }),
    );
  }
  return formatters.get(key)!.format(Number.isFinite(n) ? n : 0);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function toISODate(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function firstOfMonth(d = new Date()): string {
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}
