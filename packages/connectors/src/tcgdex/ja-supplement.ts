/**
 * Japanese sets that TCGdex has metadata for but no card lists, so its API omits them.
 * Copied from tcgdex/cards-database (MIT) data-asia/*.ts on 2026-10-21, keeping only sets with a Japanese name.
 * Corrections: ids come from the file names (BW3b.ts and BW8b.ts carry the wrong id inside), and
 * S/CS4.5 is left out (a Chinese set labelled with a Japanese name); SM2+ is left out (the API lists it as sm2+).
 * The import uses an entry only while the API does not list that set, so real API data wins once it exists.
 */
export interface JaSupplementSet { id: string; name_ja: string; release_date: string | null; card_count: number | null }

export const JA_SUPPLEMENT_SETS: JaSupplementSet[] = [
  { id: "BW1a", name_ja: "ブラックコレクション", release_date: "2010-12-17", card_count: 53 },
  { id: "BW1b", name_ja: "ホワイトコレクション", release_date: "2010-12-17", card_count: 53 },
  { id: "BW2", name_ja: "レッドコレクション", release_date: "2011-07-15", card_count: 66 },
  { id: "BW3a", name_ja: "サイコドライブ", release_date: "2011-09-16", card_count: 52 },
  { id: "BW3b", name_ja: "ヘイルブリザード", release_date: "2011-09-16", card_count: 52 },
  { id: "BW4", name_ja: "ダークラッシュ", release_date: "2011-12-16", card_count: 69 },
  { id: "BW5a", name_ja: "リューズブラスト", release_date: "2012-03-16", card_count: 50 },
  { id: "BW5b", name_ja: "リューノブレード", release_date: "2012-03-16", card_count: 50 },
  { id: "BW6a", name_ja: "フリーズボルト", release_date: "2012-07-13", card_count: 59 },
  { id: "BW6b", name_ja: "コールドフレア", release_date: "2012-07-13", card_count: 59 },
  { id: "BW7", name_ja: "プラズマゲイル", release_date: "2012-09-14", card_count: 70 },
  { id: "BW8a", name_ja: "ラセンフォース", release_date: "2012-12-14", card_count: 51 },
  { id: "BW8b", name_ja: "ライデンナックル", release_date: "2012-12-14", card_count: 51 },
  { id: "BW9", name_ja: "メガロキャノン", release_date: "2013-03-15", card_count: 76 },
  { id: "DS", name_ja: "ドラゴンセレクション", release_date: "2012-01-27", card_count: 20 },
  { id: "EBB", name_ja: "EXバトルブースト", release_date: "2013-07-13", card_count: 96 },
  { id: "SC", name_ja: "シャイニーコレクション", release_date: "2013-02-01", card_count: 20 },
  { id: "DP1a", name_ja: "時空の創造: ダイヤモンドコレクション", release_date: "2006-11-30", card_count: 117 },
  { id: "DP1b", name_ja: "時空の創造: パールコレクション", release_date: "2006-11-30", card_count: 119 },
  { id: "DP2", name_ja: "湖の秘密", release_date: "2007-03-02", card_count: 123 },
  { id: "DP3", name_ja: "ひかる闇", release_date: "2007-07-05", card_count: 119 },
  { id: "DP4a", name_ja: "月光の追跡", release_date: "2007-10-26", card_count: 70 },
  { id: "DP4b", name_ja: "夜明けの疾走", release_date: "2007-10-26", card_count: 70 },
  { id: "DP5a", name_ja: "秘境の叫び", release_date: "2008-03-14", card_count: 65 },
  { id: "DP5b", name_ja: "怒りの神殿", release_date: "2008-03-14", card_count: 65 },
  { id: "DP6", name_ja: "破空の激闘", release_date: "2008-07-10", card_count: 92 },
  { id: "Pt1", name_ja: "ギンガの覇道", release_date: "2008-10-10", card_count: 96 },
  { id: "Pt2", name_ja: "時の果ての絆", release_date: "2008-12-26", card_count: 90 },
  { id: "Pt3", name_ja: "フロンティアの鼓動", release_date: "2009-03-06", card_count: 100 },
  { id: "Pt4", name_ja: "アルセウス光臨", release_date: "2009-07-08", card_count: 90 },
  { id: "M6a", name_ja: "30th CELEBRATION", release_date: null, card_count: 103 },
  { id: "MF", name_ja: "30th CELEBRATION プレミアムデッキセット エーフィ・ブラッキー", release_date: null, card_count: 40 },
  { id: "WCS23", name_ja: "ポケモンワールドチャンピオンシップス2023横浜 記念デッキ「ピカチュウ」", release_date: null, card_count: 30 },
  { id: "XY", name_ja: "THE BEST OF XY", release_date: "2017-04-21", card_count: 171 },
];
