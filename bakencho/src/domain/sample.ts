// 動作確認用のサンプルデータ。今日を基準に過去8か月分の土日を作る（乱数は固定シード）。
import { addDays, addMonths, monthOf, weekday } from './date';
import { calcPoints } from './points';
import type { BetType, HouseholdEntry, Method, Race, Snapshot, Ticket } from './types';
import { defaultCategories } from './backup';
import { makeTicket, newId } from './ticket';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const NAMES = ['', '', '', 'メイクデビュー', '未勝利', '1勝クラス', '2勝クラス', 'オープン特別', 'ステークス', 'カップ'];

interface Pattern {
  bet: BetType;
  method: Method;
  sel: string;
  unit: number;
  hitP: number;
  odds: [number, number];
}

const PATTERNS: Pattern[] = [
  { bet: '単勝', method: '通常', sel: '7', unit: 1000, hitP: 0.22, odds: [2.2, 9] },
  { bet: '複勝', method: '通常', sel: '5', unit: 1000, hitP: 0.45, odds: [1.2, 3] },
  { bet: '馬連', method: '通常', sel: '3-7', unit: 500, hitP: 0.1, odds: [6, 40] },
  { bet: '馬連', method: '流し', sel: '3>1,5,8,12', unit: 200, hitP: 0.14, odds: [8, 45] },
  { bet: 'ワイド', method: '通常', sel: '3-7', unit: 400, hitP: 0.28, odds: [2.5, 12] },
  { bet: 'ワイド', method: 'ボックス', sel: '2,6,9', unit: 200, hitP: 0.3, odds: [3, 15] },
  { bet: '馬単', method: '通常', sel: '2→9', unit: 300, hitP: 0.06, odds: [12, 80] },
  { bet: '三連複', method: 'ボックス', sel: '3,7,12,14', unit: 100, hitP: 0.07, odds: [20, 150] },
  { bet: '三連複', method: '流し', sel: '7>1,3,5,11,14', unit: 100, hitP: 0.08, odds: [15, 120] },
  { bet: '三連単', method: 'フォーメーション', sel: '1,2/1,2,5/1,2,5,8', unit: 100, hitP: 0.03, odds: [60, 600] },
];

export function buildSample(today: string, nowIso: string): Snapshot {
  const rand = rng(20261109);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const races: Race[] = [];
  const tickets: Ticket[] = [];
  let seq = 0;
  const created = () => nowIso.replace(/(\.\d+)?Z$/, '') + '.' + String(seq++).padStart(6, '0') + 'Z';

  const startMonth = addMonths(monthOf(today), -7);
  let d = `${startMonth}-01`;
  const courses = ['東京', '京都', '福島'];
  while (d <= today) {
    const w = weekday(d);
    if (w === 0 || w === 6) {
      const n = 2 + Math.floor(rand() * 3);
      const nos = [...new Set(Array.from({ length: n }, () => 7 + Math.floor(rand() * 6)))].sort((a, b) => a - b);
      for (const no of nos) {
        const course = pick(courses);
        const race: Race = { id: newId(), date: d, course, race_no: no, name: no === 11 ? course + pick(['記念', 'ステークス', 'カップ', '特別']) : pick(NAMES) || null, note: null };
        races.push(race);
        const k = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < k; i++) {
          const p = pick(PATTERNS);
          const points = calcPoints(p.bet, p.method, p.sel) ?? 1;
          const pending = d === today && no === nos[nos.length - 1];
          const hit = rand() < p.hitP;
          const payout = pending ? null : hit ? Math.round((p.odds[0] + rand() * (p.odds[1] - p.odds[0])) * p.unit / 10) * 10 : 0;
          tickets.push(makeTicket(race.id, { bet_type: p.bet, method: p.method, selection: p.sel, unit_price: p.unit, points, payout }, created()));
        }
      }
    }
    d = addDays(d, 1);
  }

  // 要件の計算例のレース（1レース3票で1票的中）を直近の土曜に置く
  let sat = today;
  while (weekday(sat) !== 6) sat = addDays(sat, -1);
  const ex: Race = { id: newId(), date: sat, course: '中山', race_no: 12, name: '計算例のレース', note: '要件書の計算例（回収率95.4%・収支−60円）' };
  races.push(ex);
  tickets.push(makeTicket(ex.id, { bet_type: '馬連', method: '通常', selection: '3-7', unit_price: 600, points: 1, payout: 0 }, created()));
  tickets.push(makeTicket(ex.id, { bet_type: 'ワイド', method: '通常', selection: '3-7', unit_price: 400, points: 1, payout: 1240 }, created()));
  tickets.push(makeTicket(ex.id, { bet_type: '三連複', method: '通常', selection: '3-7-12', unit_price: 300, points: 1, payout: 0 }, created()));

  const household: HouseholdEntry[] = [];
  const add = (date: string, kind: 'expense' | 'income', category: string, memo: string, amount: number) => {
    if (date <= today) household.push({ id: newId(), date, kind, category, memo, amount });
  };
  for (let i = 0; i < 8; i++) {
    const m = addMonths(startMonth, i);
    add(`${m}-25`, 'income', '給与', '', 280000);
    add(`${m}-27`, 'expense', '住居', '家賃', 85000);
    add(`${m}-20`, 'expense', '光熱費', '電気・ガス', 9000 + Math.round(rand() * 6000));
    add(`${m}-15`, 'expense', '通信', 'スマホ・回線', 7480);
    for (const day of ['03', '10', '17', '24']) add(`${m}-${day}`, 'expense', '食費', 'スーパー', 4000 + Math.round(rand() * 40) * 100);
    add(`${m}-12`, 'expense', '外食', '', 1200 + Math.round(rand() * 30) * 100);
    add(`${m}-08`, 'expense', '日用品', 'ドラッグストア', 1500 + Math.round(rand() * 20) * 100);
  }

  return { races, tickets, household, categories: defaultCategories(), mappings: [] };
}
