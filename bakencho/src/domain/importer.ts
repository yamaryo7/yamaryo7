// Excel/CSV取り込み。表（行×列）とマッピングから、レースと票を組み立てる。
// 画面側はファイルを読んで2次元配列にし、ここに渡すだけ。
import { calcPoints, normalizeSelection } from './points';
import { isValidDate, makeDate } from './date';
import { BET_TYPES, BetType, COURSES, METHODS, Method, Race, Ticket } from './types';
import { makeTicket, newId } from './ticket';

export type Cell = string | number | boolean | Date | null | undefined;

export const IMPORT_FIELDS = [
  { key: 'date', label: '開催日', hint: '2026/11/9、2026-11-09、Excelの日付' },
  { key: 'course', label: '競馬場', hint: '東京、中山 など' },
  { key: 'race_no', label: 'レース番号', hint: '11 / 11R' },
  { key: 'race_label', label: 'レース（まとめ）', hint: '「東京11R」のように競馬場と番号が1つのセルの場合' },
  { key: 'name', label: 'レース名', hint: '任意' },
  { key: 'bet_type', label: '券種', hint: '単勝、馬連、3連複 など' },
  { key: 'method', label: '買い方', hint: '通常、流し、ボックス、フォーメーション（なければ通常）' },
  { key: 'selection', label: '買い目', hint: '3-7 など' },
  { key: 'points', label: '点数', hint: 'なければ買い目から計算、計算できなければ1' },
  { key: 'unit_price', label: '1点金額', hint: '購入額がない場合に使う' },
  { key: 'stake', label: '購入額', hint: '総額' },
  { key: 'payout', label: '払戻（金額）', hint: '空欄＝未確定、0＝不的中' },
  { key: 'odds', label: 'オッズ', hint: '払戻 ＝ オッズ × 1点金額 で換算' },
  { key: 'note', label: 'メモ', hint: 'レースのメモに入れる' },
] as const;
export type FieldKey = (typeof IMPORT_FIELDS)[number]['key'];

export interface ColumnRef {
  index: number;
  header: string; // 見出し行がある場合の見出し文字列（マッピング再利用時の照合に使う）
}

export interface Mapping {
  hasHeader: boolean;
  columns: Partial<Record<FieldKey, ColumnRef>>;
  /** 未確定を表す記号（カンマ区切り）。空欄の扱いは blankMeans で決める */
  pendingMarks: string;
  /** 不的中を表す記号（カンマ区切り） */
  missMarks: string;
  blankMeans: 'pending' | 'miss';
  defaultCourse: string;
  defaultBetType: BetType;
}

export const DEFAULT_MAPPING: Mapping = {
  hasHeader: true,
  columns: {},
  pendingMarks: '未,未確定,結果待ち,?,？',
  missMarks: '×,✕,外れ,ハズレ,はずれ,-',
  blankMeans: 'pending',
  defaultCourse: '',
  defaultBetType: 'その他',
};

// ---------------------------------------------------------------- 見出しから自動推定

const GUESS: Array<[FieldKey, RegExp]> = [
  ['date', /^(開催日|日付|年月日|日にち|date)$/i],
  ['race_label', /^(レース|開催|race)$/i],
  ['course', /(競馬場|^場$|^場所$|course)/i],
  ['race_no', /(レース番号|^R$|^レース$|^No\.?$|^race_?no$)/i],
  ['name', /(レース名|競走名|^name$)/i],
  ['bet_type', /(券種|式別|馬券種|bet_?type)/i],
  ['method', /(買い方|方式|method)/i],
  ['selection', /(買い目|馬番|組番|組み合わせ|selection)/i],
  ['points', /(点数|points)/i],
  ['unit_price', /(1点|一点|単価|unit)/i],
  ['stake', /(購入額|購入金額|購入|投資|賭け金|金額|stake)/i],
  ['payout', /(払戻|払い戻し|配当|回収額|payout)/i],
  ['odds', /(オッズ|倍率|odds)/i],
  ['note', /(メモ|備考|note)/i],
];

export function guessMapping(headers: ReadonlyArray<string>): Partial<Record<FieldKey, ColumnRef>> {
  const out: Partial<Record<FieldKey, ColumnRef>> = {};
  const used = new Set<number>();
  for (const [key, re] of GUESS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && re.test(h.trim()));
    if (idx >= 0) {
      out[key] = { index: idx, header: headers[idx] };
      used.add(idx);
    }
  }
  // 「レース」1列しかなく競馬場列がない場合は「まとめ」として扱う。競馬場列があれば番号として扱う。
  if (out.race_label && out.course && !out.race_no) {
    out.race_no = out.race_label;
    delete out.race_label;
  }
  return out;
}

/** 保存済みマッピングを今回の見出しに合わせる（見出し名で照合、なければ列位置）。 */
export function rebindMapping(m: Mapping, headers: ReadonlyArray<string>): Mapping {
  const columns: Partial<Record<FieldKey, ColumnRef>> = {};
  for (const [k, ref] of Object.entries(m.columns) as Array<[FieldKey, ColumnRef]>) {
    if (!ref) continue;
    const byName = m.hasHeader && ref.header ? headers.indexOf(ref.header) : -1;
    const index = byName >= 0 ? byName : ref.index;
    if (index < headers.length) columns[k] = { index, header: headers[index] ?? '' };
  }
  return { ...m, columns };
}

// ---------------------------------------------------------------- セルの解釈

const toHalf = (s: string) =>
  s.replace(/[０-９Ａ-Ｚａ-ｚ．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');

export function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return dateFromCell(v) ?? '';
  return toHalf(String(v)).trim();
}

/** Excelのシリアル値・Date・各種文字列を YYYY-MM-DD に。 */
export function dateFromCell(v: Cell): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // xlsxの日付はUTC 0時として読まれるので、UTCの暦で取り出す
    return makeDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // 1954〜2119年の範囲だけシリアル値とみなす
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return makeDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = toHalf(String(v)).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return dateFromCell(Number(s));
  const m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(s);
  if (m) {
    const d = makeDate(+m[1], +m[2], +m[3]);
    return isValidDate(d) ? d : null;
  }
  const c = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (c) {
    const d = makeDate(+c[1], +c[2], +c[3]);
    return isValidDate(d) ? d : null;
  }
  return null;
}

export function intFromCell(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = cellText(v).replace(/[,，円¥￥\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function floatFromCell(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = cellText(v).replace(/[,，倍\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCourse(s: string): string {
  return s.replace(/競馬場$/, '').replace(/\s+/g, '').trim();
}

export function raceNoFromText(s: string): number | null {
  const t = toHalf(s);
  const m = /(\d{1,2})\s*[RrＲ]/.exec(t) ?? /(\d{1,2})\s*$/.exec(t) ?? /^\s*(\d{1,2})/.exec(t);
  if (!m) return null;
  const n = +m[1];
  return n >= 1 && n <= 12 ? n : null;
}

/** 「東京11R」「11/9 東京 11R」から競馬場とレース番号を取り出す。 */
export function parseRaceLabel(s: string): { course: string | null; race_no: number | null } {
  const t = toHalf(s);
  const course = [...COURSES].sort((a, b) => b.length - a.length).find((c) => t.includes(c)) ?? null;
  const rest = course ? t.slice(t.indexOf(course) + course.length) : t;
  return { course, race_no: raceNoFromText(rest) };
}

const BET_ALIASES: Array<[RegExp, BetType]> = [
  [/^(単勝|単|tan)$/i, '単勝'],
  [/^(複勝|複|fuku)$/i, '複勝'],
  [/^(枠連|枠複|枠)$/, '枠連'],
  [/^(馬連|馬複)$/, '馬連'],
  [/^(馬単)$/, '馬単'],
  [/^(ワイド|拡連複|wide)$/i, 'ワイド'],
  [/^(三連複|3連複|３連複|三複|3複)$/, '三連複'],
  [/^(三連単|3連単|３連単|三単|3単)$/, '三連単'],
  [/^win5$/i, 'WIN5'],
];

export function normalizeBetType(s: string): BetType | null {
  const t = toHalf(s).replace(/\s/g, '');
  if (!t) return null;
  if ((BET_TYPES as readonly string[]).includes(t)) return t as BetType;
  for (const [re, bt] of BET_ALIASES) if (re.test(t)) return bt;
  return null;
}

export function normalizeMethod(s: string): Method {
  const t = toHalf(s).replace(/\s/g, '').toLowerCase();
  if (!t) return '通常';
  if ((METHODS as readonly string[]).includes(t)) return t as Method;
  if (/(流し|ながし|nagashi|軸)/.test(t)) return '流し';
  if (/(ボックス|box)/.test(t)) return 'ボックス';
  if (/(フォーメ|formation)/.test(t)) return 'フォーメーション';
  return '通常';
}

const marks = (s: string) => s.split(/[,，、]/).map((x) => toHalf(x).trim()).filter(Boolean);

// ---------------------------------------------------------------- 取り込み本体

export interface ParsedRow {
  row: number; // 1始まりの行番号（シート上の行）
  date: string;
  course: string;
  race_no: number;
  name: string | null;
  note: string | null;
  bet_type: BetType;
  method: Method;
  selection: string;
  unit_price: number;
  points: number;
  stake: number;
  payout: number | null;
}

export interface RowError {
  row: number;
  message: string;
}

export interface Duplicate {
  row: number;
  label: string;
  against: 'existing' | 'file';
}

export interface ImportPlan {
  rows: ParsedRow[];
  errors: RowError[];
  duplicates: Duplicate[];
  newRaces: Race[];
  tickets: Ticket[];
  summary: { races: number; tickets: number; pending: number; stake: number; payout: number };
}

export function dupKey(date: string, course: string, raceNo: number, betType: string, selection: string): string {
  return [date, course, raceNo, betType, normalizeSelection(selection).replace(/\s/g, '')].join('|');
}

export function parseRows(table: ReadonlyArray<ReadonlyArray<Cell>>, m: Mapping): { rows: ParsedRow[]; errors: RowError[] } {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const start = m.hasHeader ? 1 : 0;
  const pend = marks(m.pendingMarks);
  const miss = marks(m.missMarks);
  const get = (r: ReadonlyArray<Cell>, k: FieldKey): Cell => {
    const ref = m.columns[k];
    return ref ? r[ref.index] : undefined;
  };

  for (let i = start; i < table.length; i++) {
    const r = table[i];
    const rowNo = i + 1;
    if (!r || r.every((c) => cellText(c) === '')) continue;
    const fail = (message: string) => errors.push({ row: rowNo, message });

    const date = dateFromCell(get(r, 'date'));
    if (!date) { fail(`開催日を読めません（${cellText(get(r, 'date')) || '空欄'}）`); continue; }

    let course = normalizeCourse(cellText(get(r, 'course')));
    let raceNo = m.columns.race_no ? raceNoFromText(cellText(get(r, 'race_no'))) : null;
    if (m.columns.race_label) {
      const lbl = parseRaceLabel(cellText(get(r, 'race_label')));
      if (!course && lbl.course) course = lbl.course;
      if (raceNo === null) raceNo = lbl.race_no;
    }
    if (!course) course = m.defaultCourse.trim();
    if (!course) { fail('競馬場を読めません'); continue; }
    if (raceNo === null) { fail('レース番号を読めません（1〜12）'); continue; }

    const btText = cellText(get(r, 'bet_type'));
    const betType = btText ? normalizeBetType(btText) : m.defaultBetType;
    if (!betType) { fail(`券種「${btText}」を判別できません`); continue; }
    const method = normalizeMethod(cellText(get(r, 'method')));
    const selection = cellText(get(r, 'selection'));

    const pointsCell = intFromCell(get(r, 'points'));
    const unitCell = intFromCell(get(r, 'unit_price'));
    const stakeCell = intFromCell(get(r, 'stake'));
    let points = pointsCell ?? calcPoints(betType, method, selection) ?? 1;
    let unit: number;
    if (stakeCell !== null) {
      if (stakeCell <= 0) { fail('購入額が0以下です'); continue; }
      if (stakeCell % points === 0) unit = stakeCell / points;
      else { unit = stakeCell; points = 1; }
    } else if (unitCell !== null && unitCell > 0) {
      unit = unitCell;
    } else { fail('購入額（または1点金額）がありません'); continue; }
    if (points <= 0) { fail('点数が0以下です'); continue; }

    let payout: number | null;
    const payoutRef = m.columns.payout ? 'payout' : m.columns.odds ? 'odds' : null;
    if (!payoutRef) payout = null;
    else {
      const raw = get(r, payoutRef);
      const text = cellText(raw);
      if (text === '') payout = m.blankMeans === 'pending' ? null : 0;
      else if (pend.includes(text)) payout = null;
      else if (miss.includes(text)) payout = 0;
      else if (payoutRef === 'payout') {
        const v = intFromCell(raw);
        if (v === null || v < 0) { fail(`払戻「${text}」を読めません`); continue; }
        payout = v;
      } else {
        const odds = floatFromCell(raw);
        if (odds === null || odds < 0) { fail(`オッズ「${text}」を読めません`); continue; }
        payout = Math.round(odds * unit);
      }
    }

    rows.push({
      row: rowNo,
      date,
      course,
      race_no: raceNo,
      name: cellText(get(r, 'name')) || null,
      note: cellText(get(r, 'note')) || null,
      bet_type: betType,
      method,
      selection,
      unit_price: unit,
      points,
      stake: unit * points,
      payout,
    });
  }
  return { rows, errors };
}

export function buildPlan(
  table: ReadonlyArray<ReadonlyArray<Cell>>,
  m: Mapping,
  existing: { races: ReadonlyArray<Race>; tickets: ReadonlyArray<Ticket> },
  opts: { skipDuplicates: boolean; nowIso: string },
): ImportPlan {
  const { rows, errors } = parseRows(table, m);

  const raceKey = (date: string, course: string, no: number) => `${date}|${course}|${no}`;
  const existingRaceByKey = new Map(existing.races.map((r) => [raceKey(r.date, r.course, r.race_no), r]));
  const existingRaceById = new Map(existing.races.map((r) => [r.id, r]));
  const existingKeys = new Set<string>();
  for (const t of existing.tickets) {
    const r = existingRaceById.get(t.race_id);
    if (r) existingKeys.add(dupKey(r.date, r.course, r.race_no, t.bet_type, t.selection));
  }

  const duplicates: Duplicate[] = [];
  const fileKeys = new Set<string>();
  const accepted: ParsedRow[] = [];
  for (const row of rows) {
    const key = dupKey(row.date, row.course, row.race_no, row.bet_type, row.selection);
    const label = `${row.date} ${row.course}${row.race_no}R ${row.bet_type} ${row.selection}`;
    let dup: Duplicate['against'] | null = null;
    if (existingKeys.has(key)) dup = 'existing';
    else if (fileKeys.has(key)) dup = 'file';
    fileKeys.add(key);
    if (dup) {
      duplicates.push({ row: row.row, label, against: dup });
      if (opts.skipDuplicates) continue;
    }
    accepted.push(row);
  }

  const newRaces: Race[] = [];
  const newRaceByKey = new Map<string, Race>();
  const tickets: Ticket[] = [];
  const touched = new Set<string>();
  accepted.forEach((row, i) => {
    const key = raceKey(row.date, row.course, row.race_no);
    let race = existingRaceByKey.get(key) ?? newRaceByKey.get(key);
    if (!race) {
      race = { id: newId(), date: row.date, course: row.course, race_no: row.race_no, name: row.name, note: row.note };
      newRaceByKey.set(key, race);
      newRaces.push(race);
    }
    touched.add(race.id);
    // 取り込み順を保つため created_at に連番を足す
    const createdAt = opts.nowIso.replace(/(\.\d+)?Z$/, '') + '.' + String(i).padStart(6, '0') + 'Z';
    tickets.push(makeTicket(race.id, { ...row }, createdAt));
  });

  return {
    rows,
    errors,
    duplicates,
    newRaces,
    tickets,
    summary: {
      races: touched.size,
      tickets: tickets.length,
      pending: tickets.filter((t) => t.payout === null).length,
      stake: tickets.reduce((s, t) => s + t.stake, 0),
      payout: tickets.reduce((s, t) => s + (t.payout ?? 0), 0),
    },
  };
}
