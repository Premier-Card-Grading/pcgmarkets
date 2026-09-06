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
}

export interface CatalogIndex {
  setCodes(language: Language): string[];
  setsByCode(code: string, language: Language): SetRef[];
  setsByCardCount(count: number, language: Language): SetRef[];
  setsByNameOrAlias(name: string): SetRef[];
  productsBySetAndNumber(setId: string, num: number): ProductRef[];
  productsBySuffixAndNumber(suffix: string, num: number, language: Language): ProductRef[];
}

const norm = (s: string) => s.trim().toLowerCase();

export class InMemoryCatalog implements CatalogIndex {
  private byCode = new Map<string, SetRef[]>();
  private byCount = new Map<string, SetRef[]>();
  private byName = new Map<string, SetRef[]>();
  private bySetNum = new Map<string, ProductRef[]>();
  private bySuffixNum = new Map<string, ProductRef[]>();
  private codes: Record<Language, string[]> = { ja: [], en: [] };

  constructor(sets: SetRef[], products: ProductRef[]) {
    const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);
    for (const s of sets) {
      if (s.printedCode) {
        push(this.byCode, `${s.language}:${norm(s.printedCode)}`, s);
        this.codes[s.language].push(s.printedCode);
      }
      if (s.cardCount != null) push(this.byCount, `${s.language}:${s.cardCount}`, s);
      for (const n of [s.nameEn, s.nameJa, ...s.aliases]) if (n) push(this.byName, norm(n), s);
    }
    for (const p of products) {
      if (p.numberNum == null) continue;
      push(this.bySetNum, `${p.setId}:${p.numberNum}`, p);
      if (p.numberSuffix) push(this.bySuffixNum, `${p.language}:${norm(p.numberSuffix)}:${p.numberNum}`, p);
    }
  }
  setCodes(language: Language) { return this.codes[language]; }
  setsByCode(code: string, language: Language) { return this.byCode.get(`${language}:${norm(code)}`) ?? []; }
  setsByCardCount(count: number, language: Language) { return this.byCount.get(`${language}:${count}`) ?? []; }
  setsByNameOrAlias(name: string) { return this.byName.get(norm(name)) ?? []; }
  productsBySetAndNumber(setId: string, num: number) { return this.bySetNum.get(`${setId}:${num}`) ?? []; }
  productsBySuffixAndNumber(suffix: string, num: number, language: Language) {
    return this.bySuffixNum.get(`${language}:${norm(suffix)}:${num}`) ?? [];
  }
}
