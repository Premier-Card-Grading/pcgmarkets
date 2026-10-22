import Image from "next/image";
import Link from "next/link";
import type { SetCard, TilePrice } from "@/lib/sets-data";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function priceLine(p: TilePrice): string {
  if (p.kind === "pcg") return `${fmtUsd(p.usd)} · PCG ${p.grade} · ${p.nSales} sale${p.nSales === 1 ? "" : "s"}`;
  if (p.kind === "estimate") return `~${fmtUsd(p.usd)} est.`;
  return "No comps yet";
}

export function CardTile({ card, price, setCode }: { card: SetCard; price: TilePrice; setCode: string | null }) {
  const name = card.name_en ?? card.name_ja ?? card.number_printed;
  return (
    <Link href={`/card/${encodeURIComponent(card.id)}`} className="flex h-full flex-col rounded-[14px] border border-line-2 bg-surface p-2 no-underline transition-colors hover:border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
      {card.image_url
        ? <Image src={card.image_url} alt={`${name} card`} width={245} height={342} sizes="(min-width:1024px) 200px, 45vw" className="block aspect-[63/88] w-full rounded-lg object-cover" />
        : (<div className="flex aspect-[63/88] w-full flex-col justify-between rounded-lg bg-gradient-to-br from-bar-field to-bar p-3 text-bar-ink" aria-label={`${name}, no image`}>
            <span className="text-[22px] font-extrabold leading-none tracking-[-0.02em] wdth-104 tnum">{card.number_printed}</span>
            <span><span className="block text-[14px] font-bold leading-tight">{name}</span>{card.name_en && card.name_ja && <span className="mt-1 block text-[11.5px] text-bar-mute">{card.name_ja}</span>}</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-bar-mute">{setCode}</span>
          </div>)}
      <div className="mt-2 px-0.5 text-[14px] font-bold leading-tight text-ink">{name}</div>
      <div className="mt-0.5 px-0.5 text-[12px] text-mute">{[card.number_printed, card.rarity, card.name_en ? card.name_ja : null].filter(Boolean).join(" · ")}</div>
      <div className={cn("mt-auto px-0.5 pt-2 text-[13px] tnum", price.kind === "pcg" ? "font-extrabold text-ink" : "font-medium text-mute")}>{priceLine(price)}</div>
    </Link>);
}
