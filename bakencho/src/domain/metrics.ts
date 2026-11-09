// 指標の計算。すべて純粋関数。
//  - 票の的中 = payout > 0。未確定(null)の票は的中率の分母に入れないが、投資額には入れる。
//  - レースの的中 = 確定票のうち1票でも的中。未確定の票が残るレースは「未確定」。
//  - 回収率 = 払戻合計 ÷ 投資合計。収支 = 払戻 − 投資。
import { DateRange, inRange } from './period';
import { addMonths, monthOf, weekday } from './date';
import { BET_TYPES, METHODS, COURSES, Race, Ticket } from './types';

export type TicketResult = 'hit' | 'miss' | 'pending';

export function ticketResult(t: Pick<Ticket, 'payout'>): TicketResult {
  if (t.payout === null) return 'pending';
  return t.payout > 0 ? 'hit' : 'miss';
}

export interface Agg {
  tickets: number; // 票数
  settled: number; // 確定票数
  hits: number; // 的中票数
  pending: number; // 未確定票数
  stake: number; // 投資
  payout: number; // 払戻（確定分）
  balance: number; // 収支
  hitRate: number | null; // 的中率（票）= hits / settled
  returnRate: number | null; // 回収率 = payout / stake
}

export function summarize(tickets: ReadonlyArray<Pick<Ticket, 'stake' | 'payout'>>): Agg {
  let settled = 0, hits = 0, stake = 0, payout = 0;
  for (const t of tickets) {
    stake += t.stake;
    if (t.payout !== null) {
      settled++;
      payout += t.payout;
      if (t.payout > 0) hits++;
    }
  }
  return {
    tickets: tickets.length,
    settled,
    hits,
    pending: tickets.length - settled,
    stake,
    payout,
    balance: payout - stake,
    hitRate: settled > 0 ? hits / settled : null,
    returnRate: stake > 0 ? payout / stake : null,
  };
}

export type RaceResult = 'hit' | 'miss' | 'pending' | 'empty';

export function raceResult(tickets: ReadonlyArray<Pick<Ticket, 'payout'>>): RaceResult {
  if (tickets.length === 0) return 'empty';
  if (tickets.some((t) => t.payout === null)) return 'pending';
  return tickets.some((t) => (t.payout ?? 0) > 0) ? 'hit' : 'miss';
}

export interface RaceSummary {
  race: Race;
  tickets: Ticket[];
  agg: Agg;
  result: RaceResult;
}

export function groupTicketsByRace(tickets: ReadonlyArray<Ticket>): Map<string, Ticket[]> {
  const map = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const arr = map.get(t.race_id);
    if (arr) arr.push(t);
    else map.set(t.race_id, [t]);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return map;
}

/** レース単位の集計（日付降順・レース番号降順）。 */
export function raceSummaries(races: ReadonlyArray<Race>, tickets: ReadonlyArray<Ticket>, range: DateRange | null = null): RaceSummary[] {
  const byRace = groupTicketsByRace(tickets);
  return races
    .filter((r) => inRange(r.date, range))
    .map((race) => {
      const ts = byRace.get(race.id) ?? [];
      return { race, tickets: ts, agg: summarize(ts), result: raceResult(ts) };
    })
    .sort((a, b) => b.race.date.localeCompare(a.race.date) || a.race.course.localeCompare(b.race.course, 'ja') || b.race.race_no - a.race.race_no);
}

export interface RaceAgg {
  races: number; // 票のあるレース数
  settled: number; // 確定レース数（未確定の票が残っていない）
  hits: number; // 的中レース数
  pending: number;
  hitRate: number | null; // 的中率（レース）
}

export function summarizeRaces(summaries: ReadonlyArray<Pick<RaceSummary, 'result'>>): RaceAgg {
  let races = 0, settled = 0, hits = 0, pending = 0;
  for (const s of summaries) {
    if (s.result === 'empty') continue;
    races++;
    if (s.result === 'pending') pending++;
    else {
      settled++;
      if (s.result === 'hit') hits++;
    }
  }
  return { races, settled, hits, pending, hitRate: settled > 0 ? hits / settled : null };
}

/** 期間内の票（レースの開催日で絞る）。 */
export function ticketsInRange(races: ReadonlyArray<Race>, tickets: ReadonlyArray<Ticket>, range: DateRange | null): Ticket[] {
  if (range === null) return tickets.slice();
  const ids = new Set(races.filter((r) => inRange(r.date, range)).map((r) => r.id));
  return tickets.filter((t) => ids.has(t.race_id));
}

export interface Kpi {
  agg: Agg;
  raceAgg: RaceAgg;
}

export function kpi(races: ReadonlyArray<Race>, tickets: ReadonlyArray<Ticket>, range: DateRange | null): Kpi {
  const summaries = raceSummaries(races, tickets, range);
  return {
    agg: summarize(summaries.flatMap((s) => s.tickets)),
    raceAgg: summarizeRaces(summaries),
  };
}

// ---------------------------------------------------------------- 切り口

export type Dimension = 'betType' | 'method' | 'course' | 'month' | 'weekday';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  betType: '券種',
  method: '買い方',
  course: '競馬場',
  month: '月',
  weekday: '曜日',
};

export const WEEKDAY_BUCKETS = ['土', '日', 'その他'] as const;

export function weekdayBucket(date: string): (typeof WEEKDAY_BUCKETS)[number] {
  const w = weekday(date);
  return w === 6 ? '土' : w === 0 ? '日' : 'その他';
}

export interface BreakdownRow {
  key: string;
  agg: Agg;
}

export function breakdown(
  dimension: Dimension,
  races: ReadonlyArray<Race>,
  tickets: ReadonlyArray<Ticket>,
  range: DateRange | null,
): BreakdownRow[] {
  const raceById = new Map(races.map((r) => [r.id, r]));
  const groups = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const race = raceById.get(t.race_id);
    if (!race || !inRange(race.date, range)) continue;
    let key: string;
    switch (dimension) {
      case 'betType': key = t.bet_type; break;
      case 'method': key = t.method; break;
      case 'course': key = race.course; break;
      case 'month': key = monthOf(race.date); break;
      case 'weekday': key = weekdayBucket(race.date); break;
    }
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }
  const order = orderFor(dimension);
  return [...groups.entries()]
    .map(([key, ts]) => ({ key, agg: summarize(ts) }))
    .sort((a, b) => {
      if (dimension === 'month') return a.key.localeCompare(b.key);
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.key.localeCompare(b.key, 'ja');
    });
}

function orderFor(d: Dimension): readonly string[] {
  switch (d) {
    case 'betType': return BET_TYPES;
    case 'method': return METHODS;
    case 'course': return COURSES;
    case 'weekday': return WEEKDAY_BUCKETS;
    case 'month': return [];
  }
}

// ---------------------------------------------------------------- 月別

export interface MonthPoint {
  month: string;
  agg: Agg;
}

/** endMonth を最後とする count か月分の月別集計（票がない月も0で埋める）。 */
export function monthlySeries(races: ReadonlyArray<Race>, tickets: ReadonlyArray<Ticket>, endMonth: string, count = 12): MonthPoint[] {
  const startMonth = addMonths(endMonth, -(count - 1));
  const byMonth = new Map<string, Ticket[]>();
  const raceById = new Map(races.map((r) => [r.id, r]));
  for (const t of tickets) {
    const race = raceById.get(t.race_id);
    if (!race) continue;
    const m = monthOf(race.date);
    if (m < startMonth || m > endMonth) continue;
    const arr = byMonth.get(m);
    if (arr) arr.push(t);
    else byMonth.set(m, [t]);
  }
  const out: MonthPoint[] = [];
  for (let i = 0; i < count; i++) {
    const m = addMonths(startMonth, i);
    out.push({ month: m, agg: summarize(byMonth.get(m) ?? []) });
  }
  return out;
}
