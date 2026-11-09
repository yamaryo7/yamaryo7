// 表示用の整形。金額は桁区切り、率は小数1桁。

const nf = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

/** 12,345円 / −1,300円 */
export function yen(n: number): string {
  return (n < 0 ? '−' : '') + nf.format(Math.abs(n)) + '円';
}

/** 符号付き（収支向け）: +1,240円 / −60円 / 0円 */
export function signedYen(n: number): string {
  if (n > 0) return '+' + nf.format(n) + '円';
  return yen(n);
}

/** 桁区切りの数値のみ */
export function num(n: number): string {
  return (n < 0 ? '−' : '') + nf.format(Math.abs(n));
}

/** 比率（0.954 → 95.4%）。null は「—」 */
export function pct(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return '—';
  return (Math.round(r * 1000) / 10).toFixed(1) + '%';
}

export function signClass(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}
