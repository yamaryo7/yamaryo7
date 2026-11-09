// 点数の自動計算。買い目は文字列で持ち、券種と買い方から点数を出す。
//
// 書式（全角・半角どちらでも可）
//   通常         : 馬連 3-7 / 馬単 3→7 / 三連複 3-7-12 / 単勝 5     → 1点
//   ボックス     : 3,7,12,14（区切りは , - ・ 空白 どれでも）        → C(n,k) / 順序ありは P(n,k)
//   流し         : 軸>相手  例 3>1,5,8（1頭軸） 3,7>1,5,8（三連系の2頭軸）
//   フォーメーション: 1着/2着/3着 の順に「/」か「>」で区切る  例 1,2/1,2,5/1,2,5,8
//   WIN5         : 1R目/2R目/…/5R目 を「/」で区切る             → 各レースの頭数の積
import type { BetType, Method } from './types';

/** 券種ごとの選ぶ頭数（枠）。WIN5・その他は対象外。 */
const PICK: Partial<Record<BetType, number>> = {
  単勝: 1, 複勝: 1, 枠連: 2, 馬連: 2, 馬単: 2, ワイド: 2, 三連複: 3, 三連単: 3,
};
const ORDERED: ReadonlySet<BetType> = new Set<BetType>(['馬単', '三連単']);

export function pickCount(betType: BetType): number | null {
  return PICK[betType] ?? null;
}

/** 全角英数記号を半角へ、矢印・不等号を「>」に統一する。 */
export function normalizeSelection(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，、､]/g, ',')
    .replace(/[－―ー−‐]/g, '-')
    .replace(/[／]/g, '/')
    .replace(/[→⇒＞>]/g, '>')
    .replace(/[・･]/g, ',')
    .replace(/　/g, ' ')
    .trim();
}

const nums = (s: string): number[] =>
  s
    .split(/[\s,.]+/)
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);

const uniq = (a: number[]) => [...new Set(a)];

function comb(n: number, k: number): number {
  if (k < 0 || n < k) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function perm(n: number, k: number): number {
  if (k < 0 || n < k) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
}

/** 「/」「>」「-」で区切ったグループ（各グループは , や空白区切りの馬番）。 */
function groups(sel: string, seps: RegExp): number[][] {
  return sel
    .split(seps)
    .map((g) => uniq(nums(g)))
    .filter((g) => g.length > 0);
}

/** フォーメーションの組数を数える（重複・同一馬を除外、順序なしは組を一意化）。 */
export function countFormation(gs: number[][], ordered: boolean, allowSame = false): number {
  if (gs.length === 0) return 0;
  const seen = new Set<string>();
  let count = 0;
  const walk = (i: number, acc: number[]) => {
    if (i === gs.length) {
      if (ordered) {
        count++;
      } else {
        const key = [...acc].sort((a, b) => a - b).join('-');
        if (!seen.has(key)) {
          seen.add(key);
          count++;
        }
      }
      return;
    }
    for (const n of gs[i]) {
      if (!allowSame && acc.includes(n)) continue;
      acc.push(n);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return count;
}

/**
 * 点数を計算する。買い目から決められないとき（空欄、書式不一致）は null を返す。
 * null のときは入力欄の値（手入力）を使う。
 */
export function calcPoints(betType: BetType, method: Method, selection: string): number | null {
  const sel = normalizeSelection(selection);
  if (betType === 'その他') return method === '通常' ? 1 : null;
  if (!sel) return null;

  if (betType === 'WIN5') {
    const gs = groups(sel, /[/>-]/);
    if (gs.length !== 5) return null;
    return gs.reduce((p, g) => p * g.length, 1);
  }

  const k = PICK[betType]!;
  const ordered = ORDERED.has(betType);
  const sameFrameOk = betType === '枠連';

  switch (method) {
    case '通常':
      return 1;

    case 'ボックス': {
      const horses = uniq(nums(sel.replace(/[/>-]/g, ',')));
      if (horses.length < k) return null;
      if (k === 1) return horses.length;
      return ordered ? perm(horses.length, k) : comb(horses.length, k);
    }

    case '流し': {
      // 「軸>相手」。区切りに「-」を使った場合も受け付ける（例 3-1,5,8）。
      const gs = sel.includes('>') || sel.includes('/') ? groups(sel, /[/>]/) : groups(sel, /-/);
      if (k === 1) return uniq(gs.flat()).length || null;
      if (gs.length === k) return countFormation(gs, ordered, sameFrameOk); // 例 三連単 3>7>1,2,5
      if (gs.length !== 2) return null;
      const [axis, rest] = gs;
      const partners = rest.filter((n) => !axis.includes(n));
      const m = partners.length;
      if (k === 2) {
        if (axis.length !== 1) return null;
        return m; // 馬連・ワイド・枠連・馬単（1着固定）
      }
      // 三連複・三連単
      if (axis.length === 1) return ordered ? perm(m, 2) : comb(m, 2);
      if (axis.length === 2) return m;
      return null;
    }

    case 'フォーメーション': {
      const gs = groups(sel, /[/>-]/);
      if (k === 1) return uniq(gs.flat()).length || null;
      if (gs.length !== k) return null;
      return countFormation(gs, ordered, sameFrameOk) || null;
    }
  }
}

/** 買い目欄のプレースホルダ（券種と買い方で変える）。 */
export function selectionPlaceholder(betType: BetType, method: Method): string {
  if (betType === 'WIN5') return '1,2/5/3,8/11/4,6';
  if (betType === 'その他') return '自由入力';
  const k = PICK[betType]!;
  const ordered = ORDERED.has(betType);
  switch (method) {
    case '通常':
      if (k === 1) return '5';
      if (k === 2) return ordered ? '3→7' : '3-7';
      return ordered ? '3→7→12' : '3-7-12';
    case 'ボックス':
      return k === 1 ? '3,5,7' : k === 2 ? '3,7,12' : '3,7,12,14';
    case '流し':
      return k === 1 ? '3,5' : k === 2 ? '軸>相手 例 3>1,5,8' : '軸>相手 例 3>1,5,8,12';
    case 'フォーメーション':
      return k === 2 ? '1着/2着 例 3,7/1,5,8' : '例 1,2/1,2,5/1,2,5,8';
  }
}
