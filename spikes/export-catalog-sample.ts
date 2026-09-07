process.loadEnvFile();
import { writeFileSync } from "node:fs";
import { createServiceClient, must } from "../packages/db/src";
const db = createServiceClient();
const sets = must(await db.from("sets").select("id,printed_code,language,card_count,name_en,name_ja,aliases,release_date")) as Record<string, unknown>[];
const recentJa = new Set(sets.filter((s) => s.language === "ja" && String(s.release_date ?? "") > "2022-01-01").map((s) => s.id as string));
const products: Record<string, unknown>[] = [];
for (let from = 0; ; from += 1000) {
  const page = must(await db.from("products").select("id,set_id,number_num,number_denom,number_suffix,language").eq("language", "ja").range(from, from + 999)) as Record<string, unknown>[];
  products.push(...page.filter((p) => recentJa.has(p.set_id as string)));
  if (page.length < 1000) break;
}
writeFileSync("packages/domain/test/fixtures/catalog-sample.json", JSON.stringify({
  sets: sets.map((s) => ({ id: s.id, printedCode: s.printed_code, language: s.language, cardCount: s.card_count, nameEn: s.name_en, nameJa: s.name_ja, aliases: s.aliases ?? [] })),
  products: products.map((p) => ({ id: p.id, setId: p.set_id, numberNum: p.number_num, numberDenom: p.number_denom, numberSuffix: p.number_suffix, language: p.language })),
}));
console.log(`${sets.length} sets, ${products.length} products`);
