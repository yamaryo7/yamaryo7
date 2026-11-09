import { describe, expect, it } from 'vitest';
import { breakdown, kpi, monthlySeries, raceResult, raceSummaries, summarize, summarizeRaces, ticketResult, weekdayBucket } from './metrics';
import { periodRange } from './period';
import { pct, signedYen, yen } from './format';
import { race, ticket } from './testkit';

describe('1レースで3票買い1票的中（要件の計算例）', () => {
  const r = race('2026-11-01', '中山', 11);
  const ts = [
    ticket(r, '馬連', '3-7', 600, 0, { unit: 600 }),
    ticket(r, 'ワイド', '3-7', 400, 1240, { unit: 400 }),
    ticket(r, '三連複', '3-7-12', 300, 0, { unit: 300 }),
  ];

  it('票ごとの結果と回収率', () => {
    expect(ts.map(ticketResult)).toEqual(['miss', 'hit', 'miss']);
    expect(pct(summarize([ts[0]]).returnRate)).toBe('0.0%');
    expect(pct(summarize([ts[1]]).returnRate)).toBe('310.0%');
  });

  it('レース計: 投資1,300円・払戻1,240円・回収率95.4%・収支−60円', () => {
    const a = summarize(ts);
    expect(a.stake).toBe(1300);
    expect(a.payout).toBe(1240);
    expect(a.balance).toBe(-60);
    expect(yen(a.stake)).toBe('1,300円');
    expect(signedYen(a.balance)).toBe('−60円');
    expect(pct(a.returnRate)).toBe('95.4%');
  });

  it('馬券的中率33.3%、レース的中率100%', () => {
    const k = kpi([r], ts, null);
    expect(pct(k.agg.hitRate)).toBe('33.3%');
    expect(k.raceAgg).toMatchObject({ races: 1, settled: 1, hits: 1 });
    expect(pct(k.raceAgg.hitRate)).toBe('100.0%');
    expect(raceResult(ts)).toBe('hit');
  });
});

describe('未確定票が混ざるレース', () => {
  const r1 = race('2026-11-08', '東京', 11);
  const r2 = race('2026-11-08', '東京', 12);
  const t1 = [
    ticket(r1, '単勝', '7', 1000, 0),
    ticket(r1, '馬連', '7-14', 500, null), // 未確定
  ];
  const t2 = [ticket(r2, '複勝', '3', 1000, 1300)];

  it('未確定の票は的中率の分母に入らないが、投資額には入る', () => {
    const a = summarize(t1);
    expect(a.tickets).toBe(2);
    expect(a.settled).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.stake).toBe(1500);
    expect(a.payout).toBe(0);
    expect(a.hitRate).toBe(0);
  });

  it('未確定の票が残るレースは「未確定」で、レース的中率の分母から外れる', () => {
    expect(raceResult(t1)).toBe('pending');
    const k = kpi([r1, r2], [...t1, ...t2], null);
    expect(k.raceAgg).toMatchObject({ races: 2, settled: 1, hits: 1, pending: 1 });
    expect(k.raceAgg.hitRate).toBe(1);
    expect(k.agg.hitRate).toBe(1 / 2); // 確定2票中1票
    expect(k.agg.stake).toBe(2500);
  });

  it('的中票があっても未確定が残れば「未確定」', () => {
    const r = race('2026-11-08', '東京', 10);
    expect(raceResult([ticket(r, '複勝', '1', 100, 150), ticket(r, '単勝', '1', 100, null)])).toBe('pending');
  });

  it('すべて未確定なら的中率は算出しない（—）', () => {
    const r = race('2026-11-09', '福島', 12);
    const a = summarize([ticket(r, '馬連', '3-5', 400, null)]);
    expect(a.hitRate).toBeNull();
    expect(pct(a.hitRate)).toBe('—');
    expect(summarizeRaces([{ result: 'pending' }]).hitRate).toBeNull();
  });

  it('票のないレースはレース数に数えない', () => {
    const r = race('2026-11-09', '福島', 1);
    expect(raceResult([])).toBe('empty');
    expect(kpi([r], [], null).raceAgg.races).toBe(0);
  });
});

describe('期間境界（月末・月初）', () => {
  const end = race('2026-10-31', '東京', 11);
  const start = race('2026-11-01', '京都', 11);
  const ts = [ticket(end, '単勝', '1', 1000, 0), ticket(start, '単勝', '2', 500, 2000)];
  const today = '2026-11-09';

  it('今月は11/1を含み10/31を含まない', () => {
    const k = kpi([end, start], ts, periodRange({ kind: 'thisMonth' }, today));
    expect(k.agg.stake).toBe(500);
    expect(k.agg.payout).toBe(2000);
  });

  it('先月は10/31を含み11/1を含まない', () => {
    const k = kpi([end, start], ts, periodRange({ kind: 'lastMonth' }, today));
    expect(k.agg.stake).toBe(1000);
    expect(k.agg.payout).toBe(0);
  });

  it('任意の期間 10/31〜11/1 は両端を含む', () => {
    const k = kpi([end, start], ts, periodRange({ kind: 'range', from: '2026-10-31', to: '2026-11-01' }, today));
    expect(k.agg.tickets).toBe(2);
  });

  it('月末日の計算（うるう年2月、30日の月、年またぎ）', () => {
    expect(periodRange({ kind: 'month', month: '2028-02' }, today)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange({ kind: 'month', month: '2026-02' }, today)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange({ kind: 'month', month: '2026-09' }, today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange({ kind: 'lastMonth' }, '2027-01-01')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodRange({ kind: 'thisYear' }, '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('任意の期間は開始と終了が逆でも受け付ける', () => {
    expect(periodRange({ kind: 'range', from: '2026-11-30', to: '2026-11-01' }, today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('月別系列: 月末と月初の票はそれぞれの月に入る', () => {
    const s = monthlySeries([end, start], ts, '2026-11', 6);
    expect(s.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(s[4].agg.balance).toBe(-1000);
    expect(s[5].agg.balance).toBe(1500);
    expect(s[0].agg.tickets).toBe(0);
  });
});

describe('切り口', () => {
  const sat = race('2026-11-07', '東京', 11); // 土
  const sun = race('2026-11-08', '京都', 11); // 日
  const mon = race('2026-11-03', '大井', 11); // 火（祝）
  const ts = [
    ticket(sat, '馬連', '3-7', 600, 0),
    ticket(sat, 'ワイド', '1,3,7', 300, 450, { method: 'ボックス', unit: 100, points: 3 }),
    ticket(sun, '馬連', '1-2', 500, 2500),
    ticket(mon, '単勝', '4', 1000, null),
  ];
  const races = [sat, sun, mon];

  it('曜日の判定', () => {
    expect(weekdayBucket('2026-11-07')).toBe('土');
    expect(weekdayBucket('2026-11-08')).toBe('日');
    expect(weekdayBucket('2026-11-03')).toBe('その他');
  });

  it('券種別は定義順に並び、各指標を出す', () => {
    const rows = breakdown('betType', races, ts, null);
    expect(rows.map((r) => r.key)).toEqual(['単勝', '馬連', 'ワイド']);
    const umaren = rows.find((r) => r.key === '馬連')!.agg;
    expect(umaren).toMatchObject({ tickets: 2, hits: 1, stake: 1100, payout: 2500 });
    expect(umaren.hitRate).toBe(0.5);
  });

  it('買い方別・競馬場別・曜日別・月別', () => {
    expect(breakdown('method', races, ts, null).map((r) => [r.key, r.agg.tickets])).toEqual([['通常', 3], ['ボックス', 1]]);
    expect(breakdown('course', races, ts, null).map((r) => r.key)).toEqual(['東京', '京都', '大井']);
    expect(breakdown('weekday', races, ts, null).map((r) => [r.key, r.agg.stake])).toEqual([['土', 900], ['日', 500], ['その他', 1000]]);
    expect(breakdown('month', races, ts, null).map((r) => r.key)).toEqual(['2026-11']);
  });

  it('期間で絞る', () => {
    const rows = breakdown('weekday', races, ts, { from: '2026-11-07', to: '2026-11-08' });
    expect(rows.map((r) => r.key)).toEqual(['土', '日']);
  });

  it('レース一覧は日付降順', () => {
    expect(raceSummaries(races, ts).map((s) => s.race.date)).toEqual(['2026-11-08', '2026-11-07', '2026-11-03']);
  });
});
