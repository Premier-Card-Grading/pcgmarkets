import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
import { SectionHead } from "@/components/SectionHead";
import { StripCard } from "@/components/StripCard";
import { ChipLink } from "@/components/Chip";
import { TRY } from "@/lib/constants";
import { anonClient } from "@/lib/supabase-server";
import { loadHome } from "@/lib/home-data";
import { relativeTime } from "@/lib/format";
export const revalidate = 900;
export default async function Home() {
  const { recent, sets, setTotal, updatedAt } = await loadHome(anonClient());
  return (<>
    <AppHeader variant="public" search={{ show: false }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <section className="max-w-[760px] pt-[30px] pb-1.5">
        <h1 className="m-0 mb-3.5 text-[clamp(34px,5.6vw,56px)] font-extrabold leading-none tracking-[-0.03em] wdth-104 text-balance">What&apos;s your PCG slab <b className="font-extrabold text-gold">actually</b> worth?</h1>
        <p className="m-0 mb-[22px] max-w-[52ch] text-[17px] text-ink-2">Real sold prices for PCG-graded Pokémon cards, pulled from eBay and Yahoo! Auctions and matched to the exact printing. No asking prices, no guesses.</p>
        <SearchField variant="hero" autoFocus className="max-w-[680px]" />
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[13.5px] text-mute"><span className="mr-1">Try</span>{TRY.map((t) => <ChipLink key={t} href={`/search?q=${encodeURIComponent(t)}`}>{t}</ChipLink>)}</div>
      </section>
      <section className="mt-11">
        <SectionHead title="Just sold" aside={updatedAt ? `Updated ${relativeTime(updatedAt)}` : undefined} />
        {recent.length === 0 ? <p className="m-0 text-[13.5px] text-mute">No PCG sales recorded yet. Search a card to see its catalogue entry.</p>
          : <ul className="no-scrollbar -mx-5 -mt-2 flex list-none snap-x snap-mandatory gap-[18px] overflow-x-auto px-7 pt-3.5 pb-4 [scroll-padding-inline:28px]">{recent.map((s) => <StripCard key={s.id} s={s} />)}</ul>}
      </section>
      <div className="mt-9 grid grid-cols-1 gap-9 md:grid-cols-[3fr_2fr] md:gap-14">
        <section>
          <SectionHead title="Browse by set" aside="Most sales first" />
          <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 md:grid-cols-2">
            {sets.map((s) => (<li key={s.id}><a href={`/search?q=${encodeURIComponent(s.printed_code ?? s.name_en ?? s.name_ja ?? "")}`} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 rounded-[10px] border border-line-2 bg-surface px-3 py-2.5 no-underline transition-colors hover:border-line">
              <span className="text-[15px] font-bold leading-[1.25]">{s.name_ja ?? s.name_en}</span>
              {s.sale_count > 0 && <span className="col-start-2 row-span-2 rounded-full bg-sunk px-[9px] py-0.5 text-[12.5px] font-bold text-ink-2 tnum">{s.sale_count}</span>}
              <span className="text-[12.5px] text-mute">{[s.printed_code, s.language === "ja" ? "Japanese" : "English"].filter(Boolean).join(" · ")}</span>
            </a></li>))}
            <li className="md:col-span-2"><a href="/search" className="block px-3 py-2.5 text-[13.5px] font-semibold text-teal no-underline">All {setTotal.toLocaleString("en-US")} sets →</a></li>
          </ul>
        </section>
        <section>
          <SectionHead title="How it works" />
          <div className="grid gap-3.5 text-sm text-mute">
            <div><b className="mb-0.5 block font-bold text-ink">Medians, not asking prices</b>Every number is the median of real PCG slab sales matched to this exact printing.</div>
            <div><b className="mb-0.5 block font-bold text-ink">Yen and dollars, one number</b>Yen sales are converted to USD at the ECB rate on the day they sold.</div>
            <div><b className="mb-0.5 block font-bold text-ink">You see the confidence</b>A green dot means enough sales to trust the median. Grey means one or two.</div>
          </div>
        </section>
      </div>
    </main>
    <SiteFooter />
  </>);
}
