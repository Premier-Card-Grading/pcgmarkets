import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
import { anonClient } from "@/lib/supabase-server";
import { searchProducts } from "@/lib/search";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const out = q.trim().length >= 2 ? await searchProducts(anonClient(), q.trim()) : { results: [] };
  if ("redirectTo" in out) redirect(out.redirectTo);
  return (<>
    <AppHeader variant="public" search={{ value: q }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <SearchField variant="compact" initialQuery={q} className="mb-[18px] md:hidden" />
      <pre className="text-xs">{JSON.stringify(out.results, null, 1)}</pre>
    </main>
    <SiteFooter />
  </>);
}
