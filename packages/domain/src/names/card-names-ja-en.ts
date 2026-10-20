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
  "オーキド博士": "Professor Oak", "ポケモンいれかえ": "Switch", "きずぐすり": "Potion", "すごいきずぐすり": "Super Potion",
  "げんきのかけら": "Revive", "エネルギーリムーブ": "Energy Removal", "超エネルギーリムーブ": "Super Energy Removal",
  "ふしぎなアメ": "Rare Candy", "ポケモン図鑑": "Pokédex", "パソコン通信": "Computer Search", "ポケモンブリーダー": "Pokémon Breeder",
  "ポケモン交換おじさん": "Pokémon Trader", "マサキ": "Bill", "オーキド博士の新理論": "Professor Oak's New Theory",
  "ウツギ博士": "Professor Elm", "ポケモンキャッチャー": "Pokémon Catcher",
};

/** Prefixes that come before a species name. */
export const PREFIXES: [ja: string, en: string][] = [
  ["ロケット団の", "Rocket's"], ["わるい", "Dark"], ["ひかる", "Shining"],
  ["カスミの", "Misty's"], ["タケシの", "Brock's"], ["マチスの", "Lt. Surge's"], ["エリカの", "Erika's"],
  ["ナツメの", "Sabrina's"], ["キョウの", "Koga's"], ["カツラの", "Blaine's"], ["サカキの", "Giovanni's"],
  ["アローラ", "Alolan"], ["ガラル", "Galarian"], ["ヒスイ", "Hisuian"], ["パルデア", "Paldean"],
];

/** Suffixes after a species name, longest first so "LV.X" wins over "X". */
export const SUFFIXES: [ja: string, en: string][] = [
  ["LV.X", " LV.X"], ["ex", " ex"], ["EX", "-EX"], ["GX", "-GX"], ["☆", " ☆"], ["δ", " δ"],
  ["GL", " GL"], ["FB", " FB"], ["C", " C"], ["G", " G"], ["4", " 4"],
];
