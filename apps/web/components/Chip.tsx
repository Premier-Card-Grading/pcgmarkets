import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
type Variant = "default" | "number" | "lang" | "button";
const base = "inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold leading-[1.4] whitespace-nowrap";
const variants: Record<Variant, string> = {
  default: "bg-sunk text-ink-2",
  number: "bg-ink text-ground rounded-md px-2 py-0.5 text-[13px] font-extrabold wdth-82 tnum tracking-[0.01em]",
  lang: "bg-sunk text-ink-2 uppercase text-[11px] tracking-[0.06em]",
  button: "bg-surface text-ink border border-line min-h-9 md:min-h-9 px-3.5 py-0 aria-pressed:bg-ink aria-pressed:text-ground aria-pressed:border-ink transition-colors",
};
export function Chip({ variant = "default", className, ...rest }: ComponentProps<"span"> & { variant?: Variant }) { return <span className={cn(base, variants[variant], className)} {...rest} />; }
export function ChipButton({ className, ...rest }: ComponentProps<"button">) { return <button type="button" className={cn(base, variants.button, "cursor-pointer", className)} {...rest} />; }
export function ChipLink({ className, ...rest }: ComponentProps<"a">) { return <a className={cn(base, variants.button, "no-underline", className)} {...rest} />; }
