import { describe, expect, it } from 'vitest';
import { byCategory, deriveKeibaRows, householdKpi, ledger } from './household';
import { race, ticket } from './testkit';
import type { HouseholdEntry } from './types';

describe('家計簿の競馬行（票から導出）', () => {
  const a = race('2026-11-01', '中山', 11);
  const b = race('2026-11-01', '中山', 12);
  const c = race('2026-11-02', '東京', 10);
  const ts = [
    ticket(a, '馬連', '3-7', 600, 0),
    ticket(a, 'ワイド', '3-7', 400, 1240),
    ticket(a, '三連複', '3-7-12', 300, 0),
    ticket(b, '単勝', '1', 500, null), // 未確定: 購入には入る、払戻には入らない
    ticket(c, '複勝', '5', 1000, 0),
  ];

  it('開催日ごとに「馬券購入」「払戻」を合算して立てる', () => {
    const rows = deriveKeibaRows([a, b, c], ts);
    const d1 = rows.filter((r) => r.date === '2026-11-01');
    expect(d1).toHaveLength(2);
    expect(d1.find((r) => r.kind === 'expense')).toMatchObject({ category: '競馬', memo: '馬券購入', amount: 1800, auto: true });
    expect(d1.find((r) => r.kind === 'income')).toMatchObject({ category: '競馬', memo: '払戻', amount: 1240, auto: true });
    // 払戻0の日は払戻行を立てない
    expect(rows.filter((r) => r.date === '2026-11-02').map((r) => r.kind)).toEqual(['expense']);
  });

  it('手入力と合わせたKPI', () => {
    const manual: HouseholdEntry[] = [
      { id: 'h1', date: '2026-11-03', kind: 'expense', category: '食費', memo: 'スーパー', amount: 6200 },
      { id: 'h2', date: '2026-10-25', kind: 'income', category: '給与', memo: '', amount: 280000 },
    ];
    const rows = ledger(manual, [a, b, c], ts, { from: '2026-11-01', to: '2026-11-30' });
    expect(rows.map((r) => r.date)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01', '2026-11-01']);
    const k = householdKpi(rows);
    expect(k.expense).toBe(6200 + 1800 + 1000);
    expect(k.income).toBe(1240);
    expect(k.balance).toBe(1240 - 9000);
    expect(k.keibaExpense).toBe(2800);
    expect(k.keibaNetSpend).toBe(2800 - 1240);
    expect(k.keibaShare).toBeCloseTo(2800 / 9000);

    const cats = byCategory(rows);
    expect(cats[0]).toMatchObject({ kind: 'expense', category: '食費', amount: 6200 });
    expect(cats.find((c) => c.kind === 'income')).toMatchObject({ category: '競馬', amount: 1240, share: 1 });
  });
});
