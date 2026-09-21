import { notFound } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chip } from "@/components/Chip";
import { anonClient } from "@/lib/supabase-server";
import { loadCard } from "@/lib/card-data";

// Temporary stub for the card page (masthead only) — replaced by the full card
// view in Task 11. Keeps the app building after Task 8 removes gridColumns.
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadCard(anonClient(), decodeURIComponent(id));
  if (!data) notFound();
  const { product, set } = data;
  const name = product.language === "ja" ? product.name_ja ?? product.name_en : product.name_en ?? product.name_ja;
  const setName = set.name_en ?? set.name_ja ?? "";
  return (<>
    <AppHeader variant="public" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-mute">
        {setName && <Link href={`/search?q=${encodeURIComponent(set.printed_code ?? setName)}`} className="font-semibold text-teal no-underline">{setName}</Link>}
        <span>·</span>
        <span className="uppercase">{product.language}</span>
      </div>
      <h1 className="m-0 mb-3 text-[28px] font-extrabold tracking-[-0.025em]">{name}</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip variant="number">{product.number_printed}</Chip>
        {set.printed_code && <Chip>{set.printed_code}</Chip>}
        <Chip variant="lang">{product.language}</Chip>
      </div>
    </main>
    <SiteFooter />
  </>);
}
