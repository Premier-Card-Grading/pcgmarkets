import { notFound } from "next/navigation";
import Link from "next/link";
import { anonClient } from "@/lib/supabase-server";
import { loadCard, gridColumns } from "@/lib/card-data";
import { PriceGrid } from "@/components/PriceGrid";
import { SoldList } from "@/components/SoldList";
import { PriceChart } from "@/components/PriceChart";

export const revalidate = 900;
const WINDOWS = ["30d", "90d", "180d", "all"];

export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ w?: string; cert?: string }> }) {
  const { id } = await params; const { w, cert } = await searchParams;
  const window = WINDOWS.includes(w ?? "") ? w! : "90d";
  const data = await loadCard(anonClient(), decodeURIComponent(id));
  if (!data) notFound();
  const { product, set, points, sales } = data;
  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        {product.image_url && <img src={product.image_url} alt="" className="h-48 w-auto rounded-lg shadow" />}
        <div>
          <h1 className="text-2xl font-semibold">{product.name_en ?? product.name_ja}</h1>
          {product.name_en && product.name_ja && <div className="text-zinc-600">{product.name_ja}</div>}
          <div className="mt-1 text-zinc-600">{set.name_en ?? set.name_ja} {set.printed_code && <span className="text-zinc-400">({set.printed_code})</span>} · {product.number_printed} · <span className="rounded bg-zinc-100 px-1 text-xs uppercase">{product.language}</span></div>
          {cert && <div className="mt-2 text-sm text-green-700">Cert {cert} resolved to this card.</div>}
        </div>
      </div>
      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-semibold">PCG price</h2>
          <div className="flex gap-1 text-sm">{WINDOWS.map((x) => <Link key={x} href={`?w=${x}`} className={`rounded px-2 py-1 ${x === window ? "bg-zinc-900 text-white" : "bg-white border"}`}>{x}</Link>)}</div></div>
        <PriceGrid columns={gridColumns(points, window)} window={window} />
      </section>
      <section className="space-y-2"><h2 className="font-semibold">Sold</h2><SoldList sales={sales} /></section>
      <section className="space-y-2"><h2 className="font-semibold">Over time</h2><PriceChart sales={sales} /></section>
    </div>
  );
}
