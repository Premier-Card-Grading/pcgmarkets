import { notFound } from "next/navigation";
import Image from "next/image";
import { Check } from "lucide-react";
import { Suspense } from "react";
import { anonClient } from "@/lib/supabase-server";
import { loadCard } from "@/lib/card-data";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chip } from "@/components/Chip";
import { CardView } from "@/components/CardView";
import { fmtDateLong } from "@/lib/format";
export const revalidate = 900;
export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cert?: string; cg?: string; ct?: string }> }) {
  const { id } = await params; const { cert, cg, ct } = await searchParams;
  let data;
  try {
    data = await loadCard(anonClient(), decodeURIComponent(id));
  } catch {
    notFound();
  }
  if (!data) notFound();
  const { product, set } = data; const ja = product.language === "ja";
  const name = (product.name_en ?? product.name_ja) ?? product.id;
  const alt = product.name_en ? product.name_ja : null; const setName = set.name_en ?? set.name_ja ?? set.id;
  const sub = [alt, product.rarity].filter(Boolean).join(" · ");
  return (<>
    <AppHeader variant="public" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-mute"><a className="font-semibold text-teal no-underline" href={`/sets/${encodeURIComponent(set.id)}`}>{setName}</a><span>/</span><span>{ja ? "Japanese" : "English"}</span></div>
      <div className="mt-2.5 flex flex-col gap-3">
        <h1 className="m-0 text-[clamp(32px,5vw,48px)] font-extrabold leading-none tracking-[-0.03em] wdth-104 text-balance">{name}{sub && <i className="mt-2 block text-[0.45em] font-semibold not-italic tracking-[-0.01em] text-mute wdth-100">{sub}</i>}</h1>
        <div className="flex flex-wrap gap-1.5"><Chip variant="number" className="!rounded-lg !px-2.5 !py-1 !text-base">{product.number_printed}</Chip>{set.printed_code && <Chip>{set.printed_code}</Chip>}<Chip variant="lang">{ja ? "Japanese" : "English"}</Chip>{set.release_date && <Chip>Released {fmtDateLong(set.release_date)}</Chip>}</div>
        {cert && <div className="inline-flex items-center gap-2 self-start rounded-full bg-teal-soft py-1.5 pl-2.5 pr-3 text-sm font-semibold text-teal"><Check size={16} strokeWidth={2.4} />Cert {cert} is this card{cg ? `, graded PCG ${cg}${ct ? ` ${ct}` : ""}` : ""}</div>}
      </div>
      <div className="mt-[26px] grid grid-cols-1 gap-7 md:grid-cols-[250px_minmax(0,1fr)] md:gap-12">
        <aside className="flex justify-center md:sticky md:top-4 md:block md:self-start">{product.image_url ? <Image src={product.image_url} alt={`${name} card art`} width={250} height={349} priority className="block aspect-[63/88] w-[min(250px,72vw)] rounded-xl object-cover shadow-object md:w-full" /> : <div className="aspect-[63/88] w-[min(250px,72vw)] rounded-xl border border-dashed border-line bg-sunk md:w-full" />}</aside>
        <div className="min-w-0"><Suspense><CardView data={data} now={new Date().toISOString()} /></Suspense></div>
      </div>
    </main>
    <SiteFooter />
  </>);
}
