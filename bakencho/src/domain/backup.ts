// エクスポート（JSON/CSV）とJSONからの復元。
// 復元はこのアプリのJSONに加え、プロトタイプ（ブラウザ版の馬券帳）のバックアップJSONも受け付ける。
import { toCsv } from './csv';
import { isValidDate } from './date';
import { ledger } from './household';
import { ticketResult } from './metrics';
import {
  BET_TYPES, METHODS, BetType, Category, DEFAULT_CATEGORIES, HouseholdEntry, ImportMapping, KEIBA_CATEGORY, Method, Race, Snapshot, Ticket,
} from './types';
import { newId } from './ticket';

export const BACKUP_APP = 'bakencho';
export const BACKUP_VERSION = 1;

export interface BackupFile extends Snapshot {
  app: typeof BACKUP_APP;
  version: number;
  exported_at: string;
}

export function toBackupJson(s: Snapshot, exportedAt: string): string {
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exported_at: exportedAt, ...s };
  return JSON.stringify(file, null, 2);
}

const RESULT_JA = { hit: '的中', miss: '不的中', pending: '未確定' } as const;

export function ticketsCsv(s: Pick<Snapshot, 'races' | 'tickets'>): string {
  const raceById = new Map(s.races.map((r) => [r.id, r]));
  const rows = s.tickets
    .map((t) => ({ t, r: raceById.get(t.race_id) }))
    .filter((x): x is { t: Ticket; r: Race } => !!x.r)
    .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.r.course.localeCompare(b.r.course, 'ja') || a.r.race_no - b.r.race_no || a.t.created_at.localeCompare(b.t.created_at));
  return toCsv([
    ['開催日', '競馬場', 'レース番号', 'レース名', '券種', '買い方', '買い目', '1点金額', '点数', '購入額', '払戻', '結果', 'メモ'],
    ...rows.map(({ t, r }) => [
      r.date, r.course, r.race_no, r.name ?? '', t.bet_type, t.method, t.selection, t.unit_price, t.points, t.stake,
      t.payout ?? '', RESULT_JA[ticketResult(t)], r.note ?? '',
    ]),
  ]);
}

export function householdCsv(s: Pick<Snapshot, 'races' | 'tickets' | 'household'>): string {
  const rows = ledger(s.household, s.races, s.tickets, null).reverse();
  return toCsv([
    ['日付', '区分', '費目', 'メモ', '金額', '出どころ'],
    ...rows.map((r) => [r.date, r.kind === 'income' ? '収入' : '支出', r.category, r.memo, r.amount, r.auto ? '競馬収支から' : '手入力']),
  ]);
}

// ---------------------------------------------------------------- 復元

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v));
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

export function defaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({ id: newId(), name: c.name, kind: c.kind, sort_order: i }));
}

/** JSON文字列を検証して Snapshot にする。形式が違えば BackupError。 */
export function parseBackup(text: string, nowIso: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('JSONとして読めませんでした');
  }
  if (!isObj(raw) || !Array.isArray(raw.races) || !Array.isArray(raw.tickets)) {
    throw new BackupError('races と tickets を含むバックアップJSONではありません');
  }
  const isPrototype = raw.app !== BACKUP_APP;

  const races: Race[] = raw.races.map((r, i) => {
    if (!isObj(r)) throw new BackupError(`races[${i}] が不正です`);
    const date = str(r.date);
    const raceNo = int(isPrototype ? (r.no ?? r.race_no) : r.race_no);
    if (!isValidDate(date)) throw new BackupError(`races[${i}] の日付「${date}」が不正です`);
    if (raceNo === null) throw new BackupError(`races[${i}] のレース番号が不正です`);
    return {
      id: str(r.id) || newId(),
      date,
      course: str(r.course) || 'その他',
      race_no: raceNo,
      name: str(r.name) || null,
      note: str(r.note) || null,
    };
  });
  const raceIds = new Set(races.map((r) => r.id));

  const tickets: Ticket[] = raw.tickets.map((t, i) => {
    if (!isObj(t)) throw new BackupError(`tickets[${i}] が不正です`);
    const raceId = str(isPrototype ? (t.raceId ?? t.race_id) : t.race_id);
    if (!raceIds.has(raceId)) throw new BackupError(`tickets[${i}] のレースが見つかりません`);
    const betType = str(isPrototype ? (t.type ?? t.bet_type) : t.bet_type) as BetType;
    const method = str(t.method, '通常') as Method;
    const payoutRaw = t.payout;
    const payout = payoutRaw === null || payoutRaw === undefined || payoutRaw === '' ? null : int(payoutRaw);
    if (payout !== null && payout < 0) throw new BackupError(`tickets[${i}] の払戻が不正です`);
    let unit = int(t.unit_price);
    let points = int(t.points);
    const stake = int(t.stake);
    if (unit === null || points === null) {
      // プロトタイプは購入総額のみ。1点 = 総額として持つ
      if (stake === null || stake <= 0) throw new BackupError(`tickets[${i}] の購入額が不正です`);
      unit = stake;
      points = 1;
    }
    if (unit <= 0 || points <= 0) throw new BackupError(`tickets[${i}] の金額・点数が不正です`);
    return {
      id: str(t.id) || newId(),
      race_id: raceId,
      bet_type: BET_TYPES.includes(betType) ? betType : 'その他',
      method: METHODS.includes(method) ? method : '通常',
      selection: str(isPrototype ? (t.sel ?? t.selection) : t.selection),
      unit_price: unit,
      points,
      stake: unit * points,
      payout: Number.isNaN(payout) ? null : payout,
      created_at: str(t.created_at) || nowIso,
    };
  });

  const householdRaw = Array.isArray(raw.household) ? raw.household : [];
  const household: HouseholdEntry[] = householdRaw
    .map((h, i) => {
      if (!isObj(h)) throw new BackupError(`household[${i}] が不正です`);
      const date = str(h.date);
      const amount = int(h.amount);
      const kind = h.kind === 'income' ? 'income' : 'expense';
      if (!isValidDate(date)) throw new BackupError(`household[${i}] の日付が不正です`);
      if (amount === null || amount < 0) throw new BackupError(`household[${i}] の金額が不正です`);
      return { id: str(h.id) || newId(), date, kind, category: str(h.category ?? h.cat) || 'その他', memo: str(h.memo), amount } as HouseholdEntry;
    })
    // 競馬行は票から導出するので取り込まない（二重計上の防止）
    .filter((h) => h.category !== KEIBA_CATEGORY);

  let categories: Category[] = [];
  if (Array.isArray(raw.categories) && raw.categories.length > 0) {
    categories = raw.categories
      .filter(isObj)
      .map((c, i) => ({
        id: str(c.id) || newId(),
        name: str(c.name),
        kind: c.kind === 'income' ? 'income' : 'expense',
        sort_order: int(c.sort_order) ?? i,
      }) as Category)
      .filter((c) => c.name && c.name !== KEIBA_CATEGORY);
  }
  if (categories.length === 0) categories = defaultCategories();
  // 家計簿に出てくる費目がリストになければ追加する
  for (const h of household) {
    if (!categories.some((c) => c.name === h.category && c.kind === h.kind)) {
      categories.push({ id: newId(), name: h.category, kind: h.kind, sort_order: categories.length });
    }
  }

  const mappings: ImportMapping[] = Array.isArray(raw.mappings)
    ? raw.mappings.filter(isObj).map((m) => ({
        id: str(m.id) || newId(),
        name: str(m.name),
        mapping_json: str(m.mapping_json, '{}'),
        created_at: str(m.created_at) || nowIso,
      }))
    : [];

  return { races, tickets, household, categories, mappings };
}
