import { writeFileSync, mkdirSync } from "node:fs";
const kw = process.argv[2] ?? "PCG鑑定品";
const url = `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(kw)}`;
const res = await fetch(url, { headers: { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL})`, "Accept-Language": "ja" } });
console.log(res.status, url);
mkdirSync("packages/connectors/test/fixtures", { recursive: true });
writeFileSync("packages/connectors/test/fixtures/yahoo-closedsearch-pcg.html", await res.text());
