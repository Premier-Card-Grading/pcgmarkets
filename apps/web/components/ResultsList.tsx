"use client";
import { useState } from "react";
import type { SearchResult } from "@/lib/search";
import { ResultRow } from "./ResultRow";
import { ChipButton, ChipLink } from "./Chip";
import { TRY } from "@/lib/constants";
const LANGS = [{ v: "all", l: "All" }, { v: "ja", l: "Japanese" }, { v: "en", l: "English" }] as const;
export function ResultsList({ results, query }: { results: SearchResult[]; query: string }) {
  const [lang, setLang] = useState<"all" | "ja" | "en">("all");
  const shown = results.filter((r) => lang === "all" || r.language === lang);
  const n = results.length;
  return (<>
    <div className="mb-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">{query}<span className="ml-2.5 text-base font-semibold tracking-normal text-mute">{n === 0 ? "no matches" : `${n} printing${n === 1 ? "" : "s"}`}</span></h1>
      {n > 0 && <div className="ml-auto flex gap-1.5">{LANGS.map((o) => <ChipButton key={o.v} aria-pressed={lang === o.v} onClick={() => setLang(o.v)}>{o.l}</ChipButton>)}</div>}
    </div>
    {n === 0 ? (<div className="text-[15px] text-ink-2"><p className="m-0 mb-3.5">Nothing matched. Try the number as printed on the card, like 205/165, or the card name.</p><div className="flex flex-wrap items-center gap-1.5 text-[13.5px] text-mute"><span className="mr-1">Try</span>{TRY.map((t) => <ChipLink key={t} href={`/search?q=${encodeURIComponent(t)}`}>{t}</ChipLink>)}</div></div>)
    : (<><ul className="m-0 flex list-none flex-col gap-2 p-0">{shown.map((r) => <ResultRow key={r.id} r={r} />)}</ul>
      <p className="mt-3.5 text-[13.5px] text-mute">Medians over the last 90 days. Looking for another printing? Add the set code, like <a className="font-semibold text-teal" href={`/search?q=${encodeURIComponent(`${results[0]?.setCode ?? "SV2a"} ${results[0]?.numberPrinted.split("/")[0] ?? "205"}`)}`}>{results[0]?.setCode ?? "SV2a"} {results[0]?.numberPrinted.split("/")[0] ?? "205"}</a>, or search by name.</p></>)}
  </>);
}
