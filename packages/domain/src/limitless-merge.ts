export interface MergeCard { number: string; nameJa: string | null; nameEn: string | null; type?: string | null; rarity: string | null; imageXs: string | null }
export interface ExistingProduct { id: string; number_num: number | null; number_suffix: string | null; image_url: string | null }
export interface MergedProductPatch { id: string; name_en: string | null; type: string | null; rarity: string | null; isNew: boolean; number: string; nameJa: string | null; imageXs: string | null; hasImage: boolean }

export function mergeLimitlessCards(setId: string, existing: ExistingProduct[], cards: MergeCard[]): MergedProductPatch[] {
  const byNum = new Map(existing.filter((p) => p.number_num != null && p.number_suffix == null).map((p) => [p.number_num!, p]));
  return cards.map((c) => {
    const numeric = /^\d{1,3}$/.test(c.number);
    const hit = numeric ? byNum.get(Number.parseInt(c.number, 10)) : undefined;
    const id = hit?.id ?? `${setId}-${numeric ? c.number.padStart(3, "0") : c.number}`;
    return { id, name_en: c.nameEn, type: c.type ?? null, rarity: c.rarity, isNew: !hit, number: c.number, nameJa: c.nameJa, imageXs: c.imageXs, hasImage: hit?.image_url != null };
  });
}
