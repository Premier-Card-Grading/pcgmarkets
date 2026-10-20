import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SetsBrowser } from "@/components/SetsBrowser";
import { anonClient } from "@/lib/supabase-server";
import { asLang, loadSetsIndex, type Lang } from "@/lib/sets-data";
import { cn } from "@/lib/utils";
export const revalidate = 900;
export const metadata = { title: "Pokémon sets · PCG Markets" };

const TABS: { value: Lang; label: string }[] = [{ value: "en", label: "English" }, { value: "ja", label: "Japanese" }];

export default async function SetsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = asLang((await searchParams).lang);
  const { groups, counts } = await loadSetsIndex(anonClient(), lang);
  return (<>
    <AppHeader variant="public" current="sets" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <h1 className="m-0 mb-4 text-[clamp(30px,5vw,44px)] font-extrabold leading-none tracking-[-0.03em] wdth-104">Pokémon sets</h1>
      <nav aria-label="Language" className="mb-5 inline-flex gap-0.5 rounded-[10px] bg-sunk p-[3px]">
        {TABS.map((t) => (
          <Link key={t.value} href={`/sets?lang=${t.value}`} aria-current={lang === t.value ? "page" : undefined}
            className={cn("rounded-[7px] px-3.5 py-1.5 text-[14px] font-semibold no-underline min-h-9 inline-flex items-center", lang === t.value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-mute")}>
            {t.label} <span className="ml-1.5 text-[12px] font-medium text-mute tnum">{counts[t.value]}</span>
          </Link>))}
      </nav>
      <SetsBrowser key={lang} groups={groups} />
    </main>
    <SiteFooter />
  </>);
}
