import { describe, expect, it } from 'vitest';
import { buildPlan, dateFromCell, DEFAULT_MAPPING, guessMapping, Mapping, normalizeBetType, parseRaceLabel, rebindMapping } from './importer';
import { race, ticket } from './testkit';

const now = '2026-11-09T10:00:00.000Z';

describe('セルの解釈', () => {
  it('日付: シリアル値・Date・文字列', () => {
    expect(dateFromCell(46335)).toBe('2026-11-09');
    expect(dateFromCell(new Date(Date.UTC(2026, 10, 9)))).toBe('2026-11-09');
    expect(dateFromCell('2026/11/9')).toBe('2026-11-09');
    expect(dateFromCell('２０２６年１１月９日')).toBe('2026-11-09');
    expect(dateFromCell('20261109')).toBe('2026-11-09');
    expect(dateFromCell('2026/2/30')).toBeNull();
    expect(dateFromCell('')).toBeNull();
  });

  it('券種の表記ゆれ', () => {
    expect(normalizeBetType('3連複')).toBe('三連複');
    expect(normalizeBetType('馬複')).toBe('馬連');
    expect(normalizeBetType('単')).toBe('単勝');
    expect(normalizeBetType('WIN5')).toBe('WIN5');
    expect(normalizeBetType('謎')).toBeNull();
  });

  it('「東京11R」を競馬場と番号に分ける', () => {
    expect(parseRaceLabel('東京11R')).toEqual({ course: '東京', race_no: 11 });
    expect(parseRaceLabel('11/9 中山 ９Ｒ')).toEqual({ course: '中山', race_no: 9 });
  });
});

describe('見出しからの自動マッピング', () => {
  it('よくある見出しを当てる', () => {
    const m = guessMapping(['日付', '競馬場', 'R', '券種', '買い目', '購入金額', '払戻']);
    expect(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v!.index]))).toEqual({
      date: 0, course: 1, race_no: 2, bet_type: 3, selection: 4, stake: 5, payout: 6,
    });
  });

  it('保存したマッピングを列の並びが変わったファイルに当て直す', () => {
    const saved: Mapping = { ...DEFAULT_MAPPING, columns: guessMapping(['日付', '競馬場', 'R', '券種', '購入金額']) };
    const re = rebindMapping(saved, ['メモ', '日付', 'R', '競馬場', '券種', '購入金額']);
    expect(re.columns.date!.index).toBe(1);
    expect(re.columns.course!.index).toBe(3);
  });
});

describe('取り込み計画', () => {
  const headers = ['日付', 'レース', '券種', '買い方', '買い目', '点数', '購入額', '払戻'];
  const table = [
    headers,
    ['2026/11/1', '中山11R', '馬連', '', '3-7', '', '600', '0'],
    ['2026/11/1', '中山11R', 'ワイド', '', '3-7', '', '400', '1,240'],
    ['2026/11/1', '中山11R', '3連複', 'ボックス', '3,7,12', '', '300', ''], // 未確定、点数は買い目から1点
    ['2026/11/1', '中山11R', 'ワイド', '', '3-7', '', '400', '1240'], // ファイル内重複
    ['2026/11/2', '東京10R', '複勝', '', '5', '', '1000', '未'],
    ['2026/11/2', '東京', '複勝', '', '5', '', '1000', ''], // レース番号なし → エラー
    ['', '', '', '', '', '', '', ''], // 空行は無視
  ];
  const mapping: Mapping = { ...DEFAULT_MAPPING, columns: guessMapping(headers) };

  it('件数・未確定・金額合計・エラーを数える', () => {
    const plan = buildPlan(table, mapping, { races: [], tickets: [] }, { skipDuplicates: true, nowIso: now });
    expect(plan.errors).toEqual([{ row: 7, message: 'レース番号を読めません（1〜12）' }]);
    expect(plan.duplicates).toEqual([{ row: 5, label: '2026-11-01 中山11R ワイド 3-7', against: 'file' }]);
    expect(plan.summary).toEqual({ races: 2, tickets: 4, pending: 2, stake: 2300, payout: 1240 });
    const box = plan.tickets.find((t) => t.bet_type === '三連複')!;
    expect(box).toMatchObject({ method: 'ボックス', points: 1, unit_price: 300, stake: 300, payout: null });
  });

  it('既存データと同じ票は重複候補。既存のレースには票を足す', () => {
    const r = race('2026-11-01', '中山', 11, null, 'existing-race');
    const existing = { races: [r], tickets: [ticket(r, '馬連', '3-7', 600, 0)] };
    const plan = buildPlan(table, mapping, existing, { skipDuplicates: true, nowIso: now });
    expect(plan.duplicates.map((d) => [d.row, d.against])).toEqual([[2, 'existing'], [5, 'file']]);
    expect(plan.newRaces.map((x) => `${x.course}${x.race_no}`)).toEqual(['東京10']);
    expect(plan.tickets.filter((t) => t.race_id === 'existing-race')).toHaveLength(2);

    const keepDup = buildPlan(table, mapping, existing, { skipDuplicates: false, nowIso: now });
    expect(keepDup.summary.tickets).toBe(5); // エラー行を除く全行
  });

  it('オッズ列から払戻を換算し、空欄を不的中とみなす設定', () => {
    const t = [
      ['開催日', '競馬場', 'R', '券種', '買い目', '購入', 'オッズ'],
      ['2026-11-01', '東京', '11', '単勝', '7', '500', '12.4'],
      ['2026-11-01', '東京', '11', '単勝', '3', '500', ''],
    ];
    const m: Mapping = { ...DEFAULT_MAPPING, blankMeans: 'miss', columns: guessMapping(t[0] as string[]) };
    const plan = buildPlan(t, m, { races: [], tickets: [] }, { skipDuplicates: true, nowIso: now });
    expect(plan.tickets.map((x) => x.payout)).toEqual([6200, 0]);
  });
});
