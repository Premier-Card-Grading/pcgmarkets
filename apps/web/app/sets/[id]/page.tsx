import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chip } from "@/components/Chip";
import { SetLogoPanel } from "@/components/SetTileCard";
import { SetCardGrid } from "@/components/SetCardGrid";
import { anonClient } from "@/lib/supabase-server";
import { loadSetPage } from "@/lib/sets-data";
import { fmtDateLong } from "@/lib/format";
export const revalidate = 900;
// Set pages are built on first visit and cached; none are built ahead at deploy time.
export async function generateStaticParams() { return []; }

export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const data = await loadSetPage(anonClient(), id);
  if (!data) notFound();
  const { set, cards } = data; const ja = set.language === "ja";
  return (<>
    <AppHeader variant="public" current="sets" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-mute">
        <Link href="/sets" className="font-semibold text-teal no-underline">Sets</Link><span>/</span>
        <Link href={`/sets?lang=${set.language}`} className="font-semibold text-teal no-underline">{ja ? "Japanese" : "English"}</Link>
        {set.series && <><span>/</span><span>{set.series}</span></>}
      </div>
      <header className="mb-6 grid grid-cols-1 items-center gap-4 overflow-hidden rounded-[18px] border border-line-2 bg-surface md:grid-cols-[240px_minmax(0,1fr)]">
        <SetLogoPanel tile={set} className="h-[120px] md:h-full md:min-h-[140px]" />
        <div className="px-5 pb-5 md:py-5 md:pl-0">
          <h1 className="m-0 text-[clamp(28px,4.5vw,40px)] font-extrabold leading-[1.05] tracking-[-0.03em] wdth-104 text-balance">{set.displayName}</h1>
          {set.nameEn && set.nameJa && <p className="m-0 mt-1 text-[15px] font-semibold text-mute">{set.nameJa}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {set.code && <Chip variant="number">{set.code}</Chip>}
            <Chip variant="lang">{ja ? "Japanese" : "English"}</Chip>
            {set.releaseDate && <Chip>Released {fmtDateLong(set.releaseDate)}</Chip>}
            <Chip>{set.hasCards ? `${set.cardCount} cards` : "Card list coming"}</Chip>
            {set.saleCount > 0 && <Chip className="bg-gold-fill text-gold">{set.saleCount} PCG sales</Chip>}
          </div>
        </div>
      </header>
      {cards.length === 0
        ? <p className="rounded-[14px] border border-dashed border-line bg-surface px-5 py-8 text-center text-[15px] text-mute">We don&apos;t have the card list for this set yet.</p>
        : <SetCardGrid cards={cards} setCode={set.code} now={new Date().toISOString()} />}
    </main>
    <SiteFooter />
  </>);
}
