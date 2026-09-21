import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
import { ResultsList } from "@/components/ResultsList";
import { anonClient } from "@/lib/supabase-server";
import { searchProducts, type SearchOutcome } from "@/lib/search";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let out: SearchOutcome = { results: [] };
  if (q.trim().length >= 2) {
    try {
      out = await searchProducts(anonClient(), q.trim());
    } catch {
      // Supabase is currently paused, so searchProducts throws on the unreachable network; fall back to the empty state.
      out = { results: [] };
    }
  }
  if ("redirectTo" in out) redirect(out.redirectTo);
  return (<>
    <AppHeader variant="public" search={{ value: q }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <SearchField variant="compact" initialQuery={q} className="mb-[18px] md:hidden" />
      <ResultsList results={out.results} query={q} />
    </main>
    <SiteFooter />
  </>);
}
