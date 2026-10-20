// One-off: builds packages/domain/src/names/species-ja-en.json from PokéAPI's public CSV (no runtime dependency).
import { writeFileSync } from "node:fs";
const URL_CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const res = await fetch(URL_CSV);
if (!res.ok) throw new Error(`fetch ${URL_CSV} failed: ${res.status}`);
const csv = await res.text();
const JA = new Set(["1", "11"]); // ja-Hrkt (kana) and ja
const EN = "9";
const byId = new Map();
for (const line of csv.replace(/\r/g, "").trim().split("\n").slice(1)) {
  const [id, lang, name] = line.split(",");
  const e = byId.get(id) ?? { ja: new Set(), en: null };
  if (JA.has(lang)) e.ja.add(name);
  if (lang === EN) e.en = name;
  byId.set(id, e);
}
// Explicit English spellings that differ from PokéAPI, as used on official card names.
const OVERRIDES = {
  "Nidoran♀": "Nidoran ♀",
  "Nidoran♂": "Nidoran ♂",
};
const out = {};
for (const { ja, en } of byId.values()) if (en) for (const j of ja) out[j] = (OVERRIDES[en] ?? en).replace(/’/g, "'");
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "ja")));
writeFileSync(new URL("../packages/domain/src/names/species-ja-en.json", import.meta.url), JSON.stringify(sorted, null, 0) + "\n");
console.log(`wrote ${Object.keys(sorted).length} species names`);
