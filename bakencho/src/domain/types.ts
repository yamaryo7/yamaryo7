// 馬券帳のデータモデル。金額はすべて整数（円）、日付はローカル日付の文字列 YYYY-MM-DD。

export const BET_TYPES = [
  '単勝',
  '複勝',
  '枠連',
  '馬連',
  '馬単',
  'ワイド',
  '三連複',
  '三連単',
  'WIN5',
  'その他',
] as const;
export type BetType = (typeof BET_TYPES)[number];

export const METHODS = ['通常', '流し', 'ボックス', 'フォーメーション'] as const;
export type Method = (typeof METHODS)[number];

/** 中央10場 + 主な地方競馬場。入力欄は自由入力も受け付ける。 */
export const COURSES_JRA = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'] as const;
export const COURSES_NAR = [
  '門別', '盛岡', '水沢', '浦和', '船橋', '大井', '川崎', '金沢', '笠松', '名古屋', '園田', '姫路', '高知', '佐賀', '帯広',
] as const;
export const COURSES: readonly string[] = [...COURSES_JRA, ...COURSES_NAR, '海外', 'その他'];

export interface Race {
  id: string;
  date: string; // YYYY-MM-DD
  course: string;
  race_no: number;
  name: string | null;
  note: string | null;
}

export interface Ticket {
  id: string;
  race_id: string;
  bet_type: BetType;
  method: Method;
  selection: string;
  unit_price: number; // 1点あたりの円
  points: number;
  stake: number; // = unit_price * points（保存時に確定）
  payout: number | null; // null=未確定, 0=不的中
  created_at: string; // ISO文字列（表示用ではなく並び順用）
}

export type EntryKind = 'expense' | 'income';

export interface HouseholdEntry {
  id: string;
  date: string;
  kind: EntryKind;
  category: string;
  memo: string;
  amount: number; // 正の整数。収入・支出は kind で表す
}

export interface Category {
  id: string;
  name: string;
  kind: EntryKind;
  sort_order: number;
}

/** 家計簿の「競馬」費目。ユーザーは作れない予約名。 */
export const KEIBA_CATEGORY = '競馬';

export const DEFAULT_CATEGORIES: ReadonlyArray<Pick<Category, 'name' | 'kind'>> = [
  { name: '食費', kind: 'expense' },
  { name: '外食', kind: 'expense' },
  { name: '日用品', kind: 'expense' },
  { name: '住居', kind: 'expense' },
  { name: '光熱費', kind: 'expense' },
  { name: '通信', kind: 'expense' },
  { name: '交通', kind: 'expense' },
  { name: '娯楽', kind: 'expense' },
  { name: '医療', kind: 'expense' },
  { name: 'その他', kind: 'expense' },
  { name: '給与', kind: 'income' },
  { name: 'その他', kind: 'income' },
];

/** Excel取り込みのマッピング（保存して再利用する）。 */
export interface ImportMapping {
  id: string;
  name: string;
  mapping_json: string;
  created_at: string;
}

/** アプリが保持するデータ全体。エクスポート／復元の単位でもある。 */
export interface Snapshot {
  races: Race[];
  tickets: Ticket[];
  household: HouseholdEntry[];
  categories: Category[];
  mappings: ImportMapping[];
}

export const EMPTY_SNAPSHOT: Snapshot = { races: [], tickets: [], household: [], categories: [], mappings: [] };
