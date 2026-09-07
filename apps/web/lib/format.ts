export const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export function fmtNative(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(amount);
}
export const fmtDate = (iso: string) => iso.slice(0, 10);
export function gradeLabelText(value: number | null, label: string | null) {
  if (value == null) return label ?? "—";
  const v = Number.isInteger(value) ? String(value) : String(value);
  return label && label !== "any" ? `${v} ${label}` : v;
}
