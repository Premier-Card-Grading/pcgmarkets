import { ChevronDown, ChevronUp } from "lucide-react";
export function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="inline-flex items-center rounded-md bg-sunk px-[7px] py-0.5 text-[13px] font-bold text-mute">too few sales</span>;
  const dir = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const cls = dir === "up" ? "text-good bg-good-fill" : dir === "down" ? "text-bad bg-bad-fill" : "text-mute bg-sunk";
  return <span className={`inline-flex items-center gap-[3px] rounded-md px-[7px] py-0.5 text-[13px] font-bold tnum ${cls}`}>{dir === "up" && <ChevronUp size={12} strokeWidth={3} />}{dir === "down" && <ChevronDown size={12} strokeWidth={3} />}{Math.abs(Math.round(pct))}%</span>;
}
