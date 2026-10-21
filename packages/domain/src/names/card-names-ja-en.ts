// Curated, reviewed translations only. Never machine-translated. Add entries as gaps are found.

/** Whole-card names (Trainers, Energy and other non-Pokémon cards). */
export const CARD_NAMES: Record<string, string> = {
  "草エネルギー": "Grass Energy", "炎エネルギー": "Fire Energy", "水エネルギー": "Water Energy",
  "雷エネルギー": "Lightning Energy", "超エネルギー": "Psychic Energy", "闘エネルギー": "Fighting Energy",
  "悪エネルギー": "Darkness Energy", "鋼エネルギー": "Metal Energy",
  "基本草エネルギー": "Basic Grass Energy", "基本炎エネルギー": "Basic Fire Energy", "基本水エネルギー": "Basic Water Energy",
  "基本雷エネルギー": "Basic Lightning Energy", "基本超エネルギー": "Basic Psychic Energy", "基本闘エネルギー": "Basic Fighting Energy",
  "基本悪エネルギー": "Basic Darkness Energy", "基本鋼エネルギー": "Basic Metal Energy",
  "ダブル無色エネルギー": "Double Colorless Energy",
  "オーキド博士": "Professor Oak", "ポケモンいれかえ": "Switch", "きずぐすり": "Potion",
  "げんきのかけら": "Revive", "エネルギーリムーブ": "Energy Removal", "超エネルギーリムーブ": "Super Energy Removal",
  "ふしぎなアメ": "Rare Candy", "ポケモン図鑑": "Pokédex", "パソコン通信": "Computer Search", "ポケモンブリーダー": "Pokémon Breeder",
  "ポケモン交換おじさん": "Pokémon Trader", "マサキ": "Bill", "オーキド博士の新理論": "Professor Oak's New Theory",
  "ウツギ博士": "Professor Elm", "ポケモンキャッチャー": "Pokémon Catcher",
  "基本フェアリーエネルギー": "Basic Fairy Energy", "ダブルドラゴンエネルギー": "Double Dragon Energy",
  "モンスターボール": "Poké Ball", "レベルボール": "Level Ball", "ヘビーボール": "Heavy Ball",
  "プラターヌ博士": "Professor Sycamore", "アララギ博士": "Professor Juniper", "ククイ博士": "Professor Kukui",
  "フラダリ": "Lysandre", "ティエルノ": "Tierno", "コルニ": "Korrina", "ルザミーネ": "Lusamine", "イリマ": "Ilima",
  "ちからのハチマキ": "Muscle Band", "ゴツゴツメット": "Rocky Helmet", "プラスパワー": "PlusPower",
  "スーパーエネルギー回収": "Super Energy Retrieval", "ロトム図鑑": "Rotom Dex", "レッドカード": "Red Card",
};

/**
 * Series names (as stored on sets.series, from TCGdex or Limitless) grouped by the era rules below.
 * Anything not listed is "unknown era" and era-scoped names resolve to null there.
 */
export const ORIGINAL_ERA_SERIES = ["Original era", "Base", "Gym"] as const;
export const TEAM_ROCKET_ERA_SERIES = ["Scarlet & Violet", "Mega", "Mega Evolution"] as const;

/**
 * Prefixes whose English depends on the era. "ロケット団の" is "Rocket's" on Gym-era cards
 * (Rocket's Zapdos) but "Team Rocket's" on Scarlet & Violet / Mega cards (Team Rocket's Mewtwo ex).
 * No Japanese "ロケット団の<Pokémon>" card in other eras has a certain English print, so they stay null.
 */
export const ERA_PREFIXES: [ja: string, byEra: [series: readonly string[], en: string][]][] = [
  ["ロケット団の", [[ORIGINAL_ERA_SERIES, "Rocket's"], [TEAM_ROCKET_ERA_SERIES, "Team Rocket's"]]],
];

/**
 * Translations an earlier dictionary produced that are no longer certain, so an existing name_en
 * equal to one of these is a known-wrong value to correct, not a name to keep.
 * すごいきずぐすり is "Super Potion" on some old prints but "Hyper Potion" on Sword & Shield prints.
 */
export const RETIRED_NAMES: Record<string, string[]> = { "すごいきずぐすり": ["Super Potion"] };

/** Prefixes that come before a species name, the same English in every era. */
export const PREFIXES: [ja: string, en: string][] = [
  ["わるい", "Dark"], ["ひかる", "Shining"],
  ["カスミの", "Misty's"], ["タケシの", "Brock's"], ["マチスの", "Lt. Surge's"], ["エリカの", "Erika's"],
  ["ナツメの", "Sabrina's"], ["キョウの", "Koga's"], ["カツラの", "Blaine's"], ["サカキの", "Giovanni's"],
  ["アローラ", "Alolan"], ["ガラル", "Galarian"], ["ヒスイ", "Hisuian"], ["パルデア", "Paldean"],
  ["ゲンシ", "Primal"], ["ブラック", "Black"], ["ホワイト", "White"],
];

/** Suffixes after a species name, longest first so "LV.X" wins over "X". */
export const SUFFIXES: [ja: string, en: string][] = [
  ["LV.X", " LV.X"], ["VSTAR", " VSTAR"], ["VMAX", " VMAX"], ["BREAK", " BREAK"], ["V", " V"], ["◇", " ◇"], ["ex", " ex"], ["EX", "-EX"], ["GX", "-GX"], ["☆", " ☆"], ["δ", " δ"],
  ["GL", " GL"], ["FB", " FB"], ["C", " C"], ["G", " G"], ["4", " 4"],
];
