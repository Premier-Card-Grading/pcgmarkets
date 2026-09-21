"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { resolveListing, rejectListing } from "@/app/admin/review/actions";
import type { SearchResult } from "@/lib/search";
import { extractedRows, reasonLabel, sourceLine, type ReviewItemData } from "@/lib/review";
import { Price } from "./Price";
import { StatusPill } from "./StatusPill";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4", "3", "2", "1", "authentic"];

export function ReviewItem({ item, active, onDone, onSkip }: { item: ReviewItemData; active: boolean; onDone: () => void; onSkip: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [pick, setPick] = useState<SearchResult | null>(null);
  const [grade, setGrade] = useState(String(item.extracted.grade ?? "10"));
  const [tier, setTier] = useState("none");
  const [pending, start] = useTransition();

  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 2) return setHits([]);
    const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`);
    const o = await r.json();
    setHits("results" in o ? o.results : []);
  }

  const assign = () =>
    pick &&
    start(async () => {
      await resolveListing(item.id, {
        productId: pick.id,
        gradeValue: grade === "authentic" ? null : Number(grade),
        gradeLabel: grade === "authentic" ? "Authentic" : tier === "none" ? null : tier,
      });
      onDone();
    });
  const reject = () =>
    start(async () => {
      await rejectListing(item.id);
      onDone();
    });

  const name = (h: SearchResult) => (h.language === "ja" ? h.nameJa ?? h.nameEn : h.nameEn ?? h.nameJa);

  return (
    <article
      data-review-item
      data-assign={pick ? "1" : "0"}
      className={cn(
        "grid grid-cols-1 gap-4 rounded-2xl border border-line-2 bg-surface p-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8 md:p-5",
        active && "border-teal ring-[3px] ring-teal-soft",
      )}
    >
      <div className="grid min-w-0 grid-cols-[76px_1fr] gap-3.5">
        {item.imageUrls[0] ? (
          <Image src={item.imageUrls[0]} alt="" width={76} height={76} unoptimized className="h-[76px] w-[76px] rounded-[10px] object-cover" />
        ) : (
          <div className="h-[76px] w-[76px] rounded-[10px] bg-sunk" />
        )}
        <div className="min-w-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="line-clamp-2 text-base font-bold leading-[1.3] tracking-[-0.01em] text-ink no-underline hover:underline">
            {item.title}
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-mute">
            <span>
              <Price value={item.price} currency={item.currency} className="text-base" />
              {item.priceUsd != null && item.currency !== "USD" && <Price value={item.priceUsd} secondary className="ml-1.5 text-[13px]" />}
            </span>
            <span>{sourceLine(item.source, item.at, item.kind)}</span>
            <StatusPill tone="warn">{reasonLabel(item.reason)}</StatusPill>
          </div>
        </div>
        <dl className="col-span-full m-0 mt-1 grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] gap-x-3 gap-y-2 border-t border-line-2 pt-3 text-[13.5px]">
          {extractedRows(item.extracted).map((r) => (
            <div key={r.label}>
              <dt className="text-xs font-medium text-mute">{r.label}</dt>
              <dd className={cn("m-0 mt-px", r.value ? "font-bold" : "font-medium text-mute")}>{r.value ?? r.missing}</dd>
            </div>
          ))}
        </dl>
        {item.description && (
          <details className="col-span-full text-[13px] text-mute">
            <summary className="cursor-pointer font-semibold text-teal">Seller description</summary>
            <p className="mt-1.5 whitespace-pre-wrap">{item.description}</p>
          </details>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-line-2 pt-3.5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <span className="text-[13px] font-semibold text-ink-2">Assign to</span>
        {pick ? (
          <div className="grid grid-cols-[34px_1fr_auto] items-center gap-2.5 rounded-[10px] bg-sunk px-2.5 py-2 text-[13.5px]">
            {pick.imageUrl ? (
              <Image src={pick.imageUrl} alt="" width={34} height={47} className="h-[47px] w-[34px] rounded object-cover" />
            ) : (
              <div className="h-[47px] w-[34px] rounded bg-surface" />
            )}
            <div>
              <b className="block text-[14.5px] font-bold">
                {name(pick)} {pick.numberPrinted}
              </b>
              <span className="text-[12.5px] text-mute">
                {pick.setName}
                {pick.setCode ? ` ${pick.setCode}` : ""} · {pick.language === "ja" ? "Japanese" : "English"}
              </span>
            </div>
            <button type="button" onClick={() => setPick(null)} className="min-h-9 px-1 text-[13px] font-bold text-teal">
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex min-h-[42px] items-center gap-2 rounded-[10px] border border-line bg-surface pl-3 pr-1 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft">
              <Search size={16} className="text-mute" />
              <input
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder="Number or name"
                aria-label="Find card"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-mute"
              />
            </div>
            {hits.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {hits.slice(0, 6).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPick(h);
                        setHits([]);
                      }}
                      className="grid w-full grid-cols-[30px_1fr] items-center gap-2.5 rounded-lg border border-line-2 px-2 py-1.5 text-left text-[13.5px] hover:bg-sunk"
                    >
                      {h.imageUrl ? (
                        <Image src={h.imageUrl} alt="" width={30} height={42} className="h-[42px] w-[30px] rounded-[3px] object-cover" />
                      ) : (
                        <div className="h-[42px] w-[30px] rounded-[3px] border border-dashed border-line bg-sunk" />
                      )}
                      <span>
                        <b className="block font-bold">{name(h)}</b>
                        <span className="text-[12.5px] text-mute">
                          {h.setName} · {h.numberPrinted} · {h.language === "ja" ? "Japanese" : "English"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Grade
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g === "authentic" ? "Authentic" : g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Tier
            <Select value={tier} onValueChange={setTier} disabled={grade !== "10"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not stated</SelectItem>
                <SelectItem value="Flawless">Flawless</SelectItem>
                <SelectItem value="Pristine">Pristine</SelectItem>
                <SelectItem value="Gem Mint">Gem Mint</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Button data-action="assign" className="flex-1" disabled={!pick || pending} onClick={assign}>
            Assign
          </Button>
          <Button data-action="reject" variant="danger" disabled={pending} onClick={reject}>
            Reject
          </Button>
          <Button data-action="skip" variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </div>
    </article>
  );
}
