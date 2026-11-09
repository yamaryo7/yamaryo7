// 期間 = 開催日で絞る。今月／先月／今年／全期間／任意の月／任意の開始日〜終了日。
import { addMonths, firstDayOfMonth, formatMonthJa, lastDayOfMonth, monthOf } from './date';

export type Period =
  | { kind: 'thisMonth' }
  | { kind: 'lastMonth' }
  | { kind: 'thisYear' }
  | { kind: 'all' }
  | { kind: 'month'; month: string } // YYYY-MM
  | { kind: 'range'; from: string; to: string }; // 両端を含む

/** 両端を含む日付範囲。null は無制限（全期間）。 */
export interface DateRange {
  from: string;
  to: string;
}

export function periodRange(p: Period, today: string): DateRange | null {
  const thisMonth = monthOf(today);
  switch (p.kind) {
    case 'all':
      return null;
    case 'thisMonth':
      return { from: firstDayOfMonth(thisMonth), to: lastDayOfMonth(thisMonth) };
    case 'lastMonth': {
      const lm = addMonths(thisMonth, -1);
      return { from: firstDayOfMonth(lm), to: lastDayOfMonth(lm) };
    }
    case 'thisYear': {
      const y = today.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'month':
      return { from: firstDayOfMonth(p.month), to: lastDayOfMonth(p.month) };
    case 'range':
      return p.from <= p.to ? { from: p.from, to: p.to } : { from: p.to, to: p.from };
  }
}

/** YYYY-MM-DD は辞書順＝日付順なので文字列比較で判定できる。 */
export function inRange(date: string, range: DateRange | null): boolean {
  if (range === null) return true;
  return date >= range.from && date <= range.to;
}

export function periodLabel(p: Period, today: string): string {
  switch (p.kind) {
    case 'all':
      return '全期間';
    case 'thisMonth':
      return `今月（${formatMonthJa(monthOf(today))}）`;
    case 'lastMonth':
      return `先月（${formatMonthJa(addMonths(monthOf(today), -1))}）`;
    case 'thisYear':
      return `今年（${today.slice(0, 4)}年）`;
    case 'month':
      return formatMonthJa(p.month);
    case 'range': {
      const r = periodRange(p, today)!;
      return `${r.from} 〜 ${r.to}`;
    }
  }
}
