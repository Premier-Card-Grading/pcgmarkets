import { cn } from "@/lib/utils";
import { fmtNative, fmtUsd } from "@/lib/format";
export function Price({ value, currency = "USD", secondary = false, bestOffer = false, className }: { value: number | string; currency?: string; secondary?: boolean; bestOffer?: boolean; className?: string }) {
  const text = typeof value === "string" ? value : currency === "USD" && secondary ? fmtUsd(value) : fmtNative(value, currency);
  return <span className={cn("tnum leading-none", secondary ? "font-semibold text-mute" : "font-extrabold wdth-112 tracking-[-0.02em]", className)}>{bestOffer ? "≤ " : ""}{text}</span>;
}
