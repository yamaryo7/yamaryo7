import { describe, expect, it } from 'vitest';
import { BackupError, householdCsv, parseBackup, ticketsCsv, toBackupJson } from './backup';
import { parseCsv } from './csv';
import { race, ticket } from './testkit';
import type { Snapshot } from './types';

const now = '2026-11-09T00:00:00.000Z';

describe('バックアップと復元', () => {
  const r = race('2026-11-01', '中山', 11, 'テスト杯');
  const snap: Snapshot = {
    races: [r],
    tickets: [ticket(r, '馬連', '3-7', 600, 0, { unit: 100, points: 6 }), ticket(r, 'ワイド', '3-7', 400, null)],
    household: [{ id: 'h1', date: '2026-11-03', kind: 'expense', category: '食費', memo: 'カンマ,入り "引用"', amount: 6200 }],
    categories: [{ id: 'c1', name: '食費', kind: 'expense', sort_order: 0 }],
    mappings: [],
  };

  it('JSONを書き出して読み戻すと同じになる', () => {
    expect(parseBackup(toBackupJson(snap, now), now)).toEqual(snap);
  });

  it('プロトタイプ（ブラウザ版）のJSONを取り込める', () => {
    const proto = JSON.stringify({
      races: [{ id: 'a', date: '2026-10-04', course: '中山', no: 11, name: 'サンプルS' }],
      tickets: [
        { id: 'x', raceId: 'a', type: 'ワイド', sel: '3-7', stake: 400, payout: 1240 },
        { id: 'y', raceId: 'a', type: '馬連', sel: '3-7', stake: 600, payout: null },
      ],
      household: [
        { id: 'h', date: '2026-10-25', kind: 'income', cat: '給与', memo: '', amount: 280000 },
        { id: 'k', date: '2026-10-04', kind: 'expense', cat: '競馬', memo: '馬券購入', amount: 1000 },
      ],
    });
    const s = parseBackup(proto, now);
    expect(s.races[0]).toMatchObject({ race_no: 11, name: 'サンプルS' });
    expect(s.tickets[0]).toMatchObject({ race_id: 'a', bet_type: 'ワイド', selection: '3-7', stake: 400, unit_price: 400, points: 1, payout: 1240, method: '通常' });
    expect(s.tickets[1].payout).toBeNull();
    // 競馬の家計行は票から導出するので取り込まない
    expect(s.household.map((h) => h.category)).toEqual(['給与']);
    expect(s.categories.some((c) => c.name === '給与' && c.kind === 'income')).toBe(true);
  });

  it('壊れたJSONは理由つきで拒否する', () => {
    expect(() => parseBackup('{', now)).toThrow(BackupError);
    expect(() => parseBackup('{"races":[]}', now)).toThrow(/races と tickets/);
    expect(() => parseBackup(JSON.stringify({ races: [{ id: 'a', date: '2026-02-30', course: '東京', race_no: 1 }], tickets: [] }), now)).toThrow(/日付/);
  });

  it('CSVは引用符・カンマを壊さずに往復できる', () => {
    const rows = parseCsv(householdCsv(snap));
    expect(rows[0]).toEqual(['日付', '区分', '費目', 'メモ', '金額', '出どころ']);
    expect(rows.find((r) => r[2] === '食費')![3]).toBe('カンマ,入り "引用"');
    const t = parseCsv(ticketsCsv(snap));
    expect(t[1]).toEqual(['2026-11-01', '中山', '11', 'テスト杯', '馬連', '通常', '3-7', '100', '6', '600', '0', '不的中', '']);
    expect(t[2][11]).toBe('未確定');
  });
});
