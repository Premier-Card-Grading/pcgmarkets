import Image from "next/image";
import Link from "next/link";
import type { SetTile } from "@/lib/sets-data";
import { fmtDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SetLogoPanel({ tile, className }: { tile: SetTile; className?: string }) {
  if (tile.logoUrl) return (
    <div className={cn("relative flex items-center justify-center bg-white p-4", className)}>
      <Image src={tile.logoUrl} alt={`${tile.displayName} logo`} width={220} height={110} className="max-h-full w-auto object-contain" />
    </div>);
  return (
    <div className={cn("flex flex-col items-center justify-center bg-gradient-to-br from-bar to-bar-field text-bar-ink", className)}>
      <span className="text-[28px] font-extrabold tracking-[-0.02em] wdth-104">{tile.code ?? tile.id}</span>
      {tile.series && <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-bar-mute">{tile.series}</span>}
    </div>);
}

export function SetTileCard({ tile }: { tile: SetTile }) {
  const count = tile.hasCards ? `${tile.cardCount} cards` : tile.officialCount ? `${tile.officialCount} cards · card list coming` : "Card list coming";
  return (
    <Link href={`/sets/${encodeURIComponent(tile.id)}`} className="group block overflow-hidden rounded-[14px] border border-line-2 bg-surface no-underline shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors hover:border-line focus-visible:outline-2 focus-visible:outline-teal">
      <div className="relative">
        <SetLogoPanel tile={tile} className="h-[120px] border-b border-line-2" />
        {tile.releaseDate && <span className="absolute right-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-ground">{fmtDateLong(tile.releaseDate)}</span>}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="text-[15px] font-bold leading-[1.25] text-ink">{tile.displayName}</div>
        {tile.nameEn && tile.nameJa && <div className="mt-0.5 text-[12px] text-mute">{tile.nameJa}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mute">
          {tile.code && <span className="font-semibold text-ink-2">{tile.code}</span>}<span>{count}</span>
          {tile.saleCount > 0 && <span className="rounded-full bg-gold-fill px-2 py-px text-[11.5px] font-bold text-gold tnum">{tile.saleCount} PCG sales</span>}
        </div>
      </div>
    </Link>);
}
