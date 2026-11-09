// テスト・サンプル用の小さな組み立てヘルパ。
import type { BetType, Method, Race, Ticket } from './types';

let seq = 0;

export function race(date: string, course: string, raceNo: number, name: string | null = null, id?: string): Race {
  return { id: id ?? `r${++seq}`, date, course, race_no: raceNo, name, note: null };
}

export function ticket(
  r: Race,
  betType: BetType,
  selection: string,
  stake: number,
  payout: number | null,
  opts: { method?: Method; unit?: number; points?: number } = {},
): Ticket {
  const unit = opts.unit ?? (opts.points ? stake / opts.points : stake);
  const points = opts.points ?? 1;
  return {
    id: `t${++seq}`,
    race_id: r.id,
    bet_type: betType,
    method: opts.method ?? '通常',
    selection,
    unit_price: unit,
    points,
    stake: unit * points,
    payout,
    created_at: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(6, '0')}Z`,
  };
}
