import type { Language } from "./types";

export interface SetRef {
  id: string;
  printedCode: string | null;
  language: Language;
  cardCount: number | null;
  nameEn: string | null;
  nameJa: string | null;
  aliases: string[];
}

export interface ProductRef {
  id: string;
  setId: string;
  numberNum: number | null;
  numberDenom: number | null;
  numberSuffix: string | null;
  language: Language;
  numberPrinted?: string;
  nameEn?: string | null;
}

export interface CatalogIndex {
  setCodes(language: Language): string[];
  setsByCode(code: string, language: Language): SetRef[];
  setsByCardCount(count: number, language: Language): SetRef[];
  setsByNameOrAlias(name: string): SetRef[];
  /** Conservative whole-name/alias containment scan of free text (case-insensitive). Used only
   * as a last-resort fallback (e.g. eBay-title matching) — never for matching a card by name. */
  findSetsInText(text: string): SetRef[];
  productsBySetAndNumber(setId: string, num: number): ProductRef[];
  productsBySuffixAndNumber(suffix: string, num: number, language: Language): ProductRef[];
  /** Every product in a language with this number, across all sets (PCG cert resolution). */
  productsByLanguageAndNumber(language: Language, num: number): ProductRef[];
  /** Products whose printed number is exactly this (case/space-insensitive), e.g. "XY141". */
  productsByPrinted(language: Language, printed: string): ProductRef[];
  /** Every product in a set (Japanese vintage cert resolution, where the cards print no number). */
  productsInSet(setId: string): ProductRef[];
  set(id: string): SetRef | undefined;
}

const norm = (s: string) => s.trim().toLowerCase();
const printedKey = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Short names/aliases (e.g. bare numeric aliases like "151") are too noise-prone for free-text scanning. */
const MIN_NAME_LEN_FOR_TEXT_SCAN = 4;

export class InMemoryCatalog implements CatalogIndex {
  private byCode = new Map<string, SetRef[]>();
  private byCount = new Map<string, SetRef[]>();
  private byName = new Map<string, SetRef[]>();
  private bySetNum = new Map<string, ProductRef[]>();
  private bySuffixNum = new Map<string, ProductRef[]>();
  private byLangNum = new Map<string, ProductRef[]>();
  private byPrinted = new Map<string, ProductRef[]>();
  private bySet = new Map<string, ProductRef[]>();
  private setsById = new Map<string, SetRef>();
  private codes: Record<Language, string[]> = { ja: [], en: [] };

  constructor(sets: SetRef[], products: ProductRef[]) {
    const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);
    for (const s of sets) {
      this.setsById.set(s.id, s);
      if (s.printedCode) {
        push(this.byCode, `${s.language}:${norm(s.printedCode)}`, s);
        this.codes[s.language].push(s.printedCode);
      }
      if (s.cardCount != null) push(this.byCount, `${s.language}:${s.cardCount}`, s);
      for (const n of [s.nameEn, s.nameJa, ...s.aliases]) if (n) push(this.byName, norm(n), s);
    }
    for (const p of products) {
      push(this.bySet, p.setId, p);
      if (p.numberPrinted) push(this.byPrinted, `${p.language}:${printedKey(p.numberPrinted)}`, p);
      if (p.numberNum == null) continue;
      push(this.byLangNum, `${p.language}:${p.numberNum}`, p);
      push(this.bySetNum, `${p.setId}:${p.numberNum}`, p);
      if (p.numberSuffix) push(this.bySuffixNum, `${p.language}:${norm(p.numberSuffix)}:${p.numberNum}`, p);
    }
  }
  setCodes(language: Language) { return this.codes[language]; }
  setsByCode(code: string, language: Language) { return this.byCode.get(`${language}:${norm(code)}`) ?? []; }
  setsByCardCount(count: number, language: Language) { return this.byCount.get(`${language}:${count}`) ?? []; }
  setsByNameOrAlias(name: string) { return this.byName.get(norm(name)) ?? []; }
  findSetsInText(text: string): SetRef[] {
    const found = new Map<string, SetRef>();
    for (const [name, refs] of this.byName) {
      if (name.length < MIN_NAME_LEN_FOR_TEXT_SCAN) continue;
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, "i");
      if (re.test(text)) for (const r of refs) found.set(r.id, r);
    }
    return [...found.values()];
  }
  productsBySetAndNumber(setId: string, num: number) { return this.bySetNum.get(`${setId}:${num}`) ?? []; }
  productsBySuffixAndNumber(suffix: string, num: number, language: Language) {
    return this.bySuffixNum.get(`${language}:${norm(suffix)}:${num}`) ?? [];
  }
  productsByLanguageAndNumber(language: Language, num: number) { return this.byLangNum.get(`${language}:${num}`) ?? []; }
  productsByPrinted(language: Language, printed: string) { return this.byPrinted.get(`${language}:${printedKey(printed)}`) ?? []; }
  productsInSet(setId: string) { return this.bySet.get(setId) ?? []; }
  set(id: string) { return this.setsById.get(id); }
}
