"use client";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
const wrap = { hero: "min-h-[62px] rounded-[14px] pl-4 pr-1.5 shadow-object", compact: "min-h-[42px] rounded-[10px] pl-3 pr-1", header: "min-h-[42px] rounded-[10px] pl-3 pr-1 bg-bar-field border-bar-line text-bar-ink" } as const;
export function SearchField({ variant, initialQuery = "", placeholder = "Number, name or cert", autoFocus, className }: { variant: keyof typeof wrap; initialQuery?: string; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState(initialQuery); const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault(); const query = q.trim(); if (query.length < 2) return;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`); const out = await res.json();
    router.push("redirectTo" in out ? out.redirectTo : `/search?q=${encodeURIComponent(query)}`);
  }
  const header = variant === "header";
  return (
    <form role="search" onSubmit={go} className={cn("flex items-center gap-2 border border-line bg-surface focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft", wrap[variant], className)}>
      <Search size={variant === "hero" ? 18 : 16} className={header ? "text-bar-mute shrink-0" : "text-mute shrink-0"} aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} inputMode="search" aria-label="Search cards" autoFocus={autoFocus}
        className={cn("min-w-0 flex-1 bg-transparent py-2 font-medium outline-none placeholder:font-normal", variant === "hero" ? "text-[19px]" : "text-[15px]", header ? "text-bar-ink placeholder:text-bar-mute" : "text-ink placeholder:text-mute")} />
      <button type="submit" className={cn("rounded-[7px] font-bold", variant === "hero" ? "min-h-12 rounded-[10px] px-5 text-[15px]" : "min-h-8 px-3.5 text-sm", header ? "bg-gold-badge text-badge-ink" : "bg-ink text-ground")}>Search</button>
    </form>
  );
}
