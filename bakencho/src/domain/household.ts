// 家計簿。競馬の行は保存せず、常に票から導出する。
//   開催日ごとに「競馬／馬券購入（支出、その日の投資合計）」「競馬／払戻（収入、その日の払戻合計）」
import { DateRange, inRange } from './period';
import { HouseholdEntry, KEIBA_CATEGORY, Race, Ticket, EntryKind } from './types';

export interface LedgerRow extends HouseholdEntry {
  /** true = 競馬収支から自動で導出した行（削除・編集不可） */
  auto: boolean;
}

export function deriveKeibaRows(races: ReadonlyArray<Race>, tickets: ReadonlyArray<Ticket>): LedgerRow[] {
  const dateByRace = new Map(races.map((r) => [r.id, r.date]));
  const byDate = new Map<string, { stake: number; payout: number }>();
  for (const t of tickets) {
    const date = dateByRace.get(t.race_id);
    if (!date) continue;
    const v = byDate.get(date) ?? { stake: 0, payout: 0 };
    v.stake += t.stake;
    v.payout += t.payout ?? 0;
    byDate.set(date, v);
  }
  const rows: LedgerRow[] = [];
  for (const [date, v] of byDate) {
    if (v.stake > 0) {
      rows.push({ id: `keiba-expense-${date}`, date, kind: 'expense', category: KEIBA_CATEGORY, memo: '馬券購入', amount: v.stake, auto: true });
    }
    if (v.payout > 0) {
      rows.push({ id: `keiba-income-${date}`, date, kind: 'income', category: KEIBA_CATEGORY, memo: '払戻', amount: v.payout, auto: true });
    }
  }
  return rows;
}

/** 手入力行と競馬の自動行を合わせた明細（日付降順、同日は手入力→自動の順）。 */
export function ledger(
  household: ReadonlyArray<HouseholdEntry>,
  races: ReadonlyArray<Race>,
  tickets: ReadonlyArray<Ticket>,
  range: DateRange | null,
): LedgerRow[] {
  const manual: LedgerRow[] = household.map((h) => ({ ...h, auto: false }));
  return [...manual, ...deriveKeibaRows(races, tickets)]
    .filter((r) => inRange(r.date, range))
    .sort((a, b) => b.date.localeCompare(a.date) || Number(a.auto) - Number(b.auto) || (a.kind === b.kind ? 0 : a.kind === 'expense' ? -1 : 1));
}

export interface HouseholdKpi {
  income: number;
  expense: number;
  balance: number; // 収支 = 収入 − 支出
  keibaExpense: number;
  keibaIncome: number;
  keibaShare: number | null; // 支出のうち競馬の比率
  keibaNetSpend: number; // 競馬の純支出 = 購入 − 払戻（プラスなら持ち出し）
}

export function householdKpi(rows: ReadonlyArray<LedgerRow>): HouseholdKpi {
  let income = 0, expense = 0, keibaExpense = 0, keibaIncome = 0;
  for (const r of rows) {
    const keiba = r.category === KEIBA_CATEGORY;
    if (r.kind === 'income') {
      income += r.amount;
      if (keiba) keibaIncome += r.amount;
    } else {
      expense += r.amount;
      if (keiba) keibaExpense += r.amount;
    }
  }
  return {
    income,
    expense,
    balance: income - expense,
    keibaExpense,
    keibaIncome,
    keibaShare: expense > 0 ? keibaExpense / expense : null,
    keibaNetSpend: keibaExpense - keibaIncome,
  };
}

export interface CategoryRow {
  kind: EntryKind;
  category: string;
  amount: number;
  count: number;
  share: number | null; // 同じ区分（収入／支出）の中での構成比
}

export function byCategory(rows: ReadonlyArray<LedgerRow>, categoryOrder: ReadonlyArray<string> = []): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  const totals = { income: 0, expense: 0 };
  for (const r of rows) {
    const key = `${r.kind}\u0000${r.category}`;
    const row = map.get(key) ?? { kind: r.kind, category: r.category, amount: 0, count: 0, share: null };
    row.amount += r.amount;
    row.count++;
    map.set(key, row);
    totals[r.kind] += r.amount;
  }
  const idx = (c: string) => {
    if (c === KEIBA_CATEGORY) return -1;
    const i = categoryOrder.indexOf(c);
    return i < 0 ? 9999 : i;
  };
  return [...map.values()]
    .map((r) => ({ ...r, share: totals[r.kind] > 0 ? r.amount / totals[r.kind] : null }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'expense' ? -1 : 1) || b.amount - a.amount || idx(a.category) - idx(b.category));
}
