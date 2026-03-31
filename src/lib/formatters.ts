/**
 * Format a number as Malaysian Ringgit currency.
 * Returns "—" for null/undefined values.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a number with commas (no decimal constraint).
 * Returns "—" for null/undefined values.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

/**
 * Format a unit price to 4 decimal places.
 * Returns "—" for null/undefined values.
 */
export function formatUnitPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toFixed(4);
}

/**
 * Generate month options for the last 12 months.
 * Returns array of { value: "YYYY-MM", label: "Month Year" }.
 */
export function getMonthOptions(): { value: string; label: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-MY", { year: "numeric", month: "long" }),
    });
  }
  return options;
}
