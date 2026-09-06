import { SearchBox } from "@/components/SearchBox";
export default function Home() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">What did PCG slabs actually sell for?</h1>
        <p className="text-zinc-600">Search by card number first — that&apos;s the fastest way to the right printing.</p></div>
      <SearchBox />
    </div>
  );
}
