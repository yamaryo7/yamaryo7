// ローカル日付（YYYY-MM-DD）だけを扱う。タイムゾーン変換はしない。
// 曜日や月末の計算は UTC の暦計算で行い、端末のタイムゾーンに影響されないようにする。

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function isValidDate(s: string): boolean {
  const m = RE_DATE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function makeDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 端末のローカル時刻での今日。 */
export function todayLocal(now: Date = new Date()): string {
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parts(date: string): { y: number; m: number; d: number } {
  return { y: +date.slice(0, 4), m: +date.slice(5, 7), d: +date.slice(8, 10) };
}

/** 0=日曜 … 6=土曜 */
export function weekday(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayJa(date: string): string {
  return WEEKDAY_JA[weekday(date)];
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return makeDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** YYYY-MM に n か月足す */
export function addMonths(month: string, n: number): string {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

export function lastDayOfMonth(month: string): string {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  return makeDate(y, m, daysInMonth(y, m));
}

export function formatMonthJa(month: string): string {
  return `${+month.slice(0, 4)}年${+month.slice(5, 7)}月`;
}

export function formatDateJa(date: string): string {
  const { m, d } = parts(date);
  return `${m}/${d}(${weekdayJa(date)})`;
}
