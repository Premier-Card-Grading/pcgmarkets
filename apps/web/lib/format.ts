export const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export function fmtNative(amount: number, currency: string) {
  if (currency === "JPY") return `¥${Math.round(amount).toLocaleString("en-US")}`;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}
const long = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDateLong = (iso: string) => long.format(new Date(iso));
export const fmtDateShort = (iso: string) => short.format(new Date(iso));
export const fmtDate = (iso: string) => iso.slice(0, 10);
export function relativeTime(iso: string, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime(); const abs = Math.abs(diff);
  const m = Math.round(abs / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (diff > 0) return h >= 1 ? `in ${h} h ${String(m % 60).padStart(2, "0").replace(/^0/, "")} m`.replace(/ 0 m$/, "") : `in ${m} m`;
  if (d >= 1) return `${d} d ago`;
  if (h >= 1) return `${h} h ago`;
  return `${Math.max(m, 1)} m ago`;
}
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  if (m === 0) return `${s} s`;
  return `${m} m ${String(s % 60).padStart(2, "0")} s`;
}
export function gradeLabelText(value: number | null, label: string | null) {
  if (value == null) return label ?? "—";
  return label && label !== "any" ? `${value} ${label}` : String(value);
}
