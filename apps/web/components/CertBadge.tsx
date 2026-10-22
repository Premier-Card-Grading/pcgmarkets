"use client";
import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";

/** "Cert 123 is this card, graded PCG 10" — read from ?cert=&cg=&ct= in the browser, so the card page itself can be cached. */
export function CertBadge() {
  const sp = useSearchParams();
  const cert = sp.get("cert"), cg = sp.get("cg"), ct = sp.get("ct");
  if (!cert) return null;
  return <div className="inline-flex items-center gap-2 self-start rounded-full bg-teal-soft py-1.5 pl-2.5 pr-3 text-sm font-semibold text-teal"><Check size={16} strokeWidth={2.4} />Cert {cert} is this card{cg ? `, graded PCG ${cg}${ct ? ` ${ct}` : ""}` : ""}</div>;
}
