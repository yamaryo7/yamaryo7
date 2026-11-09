// 票の作成と検証。stake は保存時に unit_price × points で確定させる。
import type { BetType, Method, Ticket } from './types';
import { BET_TYPES, METHODS } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface TicketDraft {
  bet_type: BetType;
  method: Method;
  selection: string;
  unit_price: number;
  points: number;
  payout: number | null;
}

export function validateDraft(d: TicketDraft): string | null {
  if (!BET_TYPES.includes(d.bet_type)) return '券種が不正です';
  if (!METHODS.includes(d.method)) return '買い方が不正です';
  if (!Number.isInteger(d.unit_price) || d.unit_price <= 0) return '1点金額は1円以上の整数で入力してください';
  if (!Number.isInteger(d.points) || d.points <= 0) return '点数は1以上の整数で入力してください';
  if (d.payout !== null && (!Number.isInteger(d.payout) || d.payout < 0)) return '払戻は0以上の整数で入力してください';
  return null;
}

export function makeTicket(raceId: string, d: TicketDraft, createdAt: string, id: string = newId()): Ticket {
  return {
    id,
    race_id: raceId,
    bet_type: d.bet_type,
    method: d.method,
    selection: d.selection.trim(),
    unit_price: d.unit_price,
    points: d.points,
    stake: d.unit_price * d.points,
    payout: d.payout,
    created_at: createdAt,
  };
}

/** 文字列の金額（桁区切り・全角・円記号つきも可）を整数に。空欄は null。不正は NaN。 */
export function parseYen(s: string): number | null {
  const t = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，円¥￥\s]/g, '');
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return NaN;
  return Number(t);
}
