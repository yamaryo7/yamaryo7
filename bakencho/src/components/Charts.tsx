// SVGの軽量チャート（外部ライブラリなし）。表示幅を測って描くので、文字の大きさが画面幅で変わらない。
import { useLayoutEffect, useRef, useState } from 'react';
import { num, pct, signedYen } from '../domain/format';

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(240, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
import type { MonthPoint } from '../domain/metrics';

function niceStep(max: number): number {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function shortYen(v: number): string {
  const a = Math.abs(v);
  const s = a >= 10000 ? `${Math.round((a / 10000) * 10) / 10}万` : num(a);
  return (v < 0 ? '−' : v > 0 ? '+' : '') + s;
}

/** 月別収支の棒グラフ（ゼロ線あり）。選択中の期間に入る月は濃く表示。 */
export function MonthlyBalanceChart({ points, highlight }: { points: MonthPoint[]; highlight: (month: string) => boolean }) {
  const [ref, W] = useWidth<HTMLDivElement>(380);
  const H = 230, L = 50, R = 16, T = 18, B = 24;
  const vals = points.map((p) => p.agg.balance);
  const maxAbs = Math.max(1000, ...vals.map(Math.abs));
  const step = niceStep(maxAbs);
  const top = Math.ceil(Math.max(0, ...vals) / step) * step || step;
  const bottom = Math.floor(Math.min(0, ...vals) / step) * step;
  const y = (v: number) => T + ((top - v) / (top - bottom)) * (H - T - B);
  const iw = (W - L - R) / points.length;
  // 狭いときは選択中の月（3か月以内）だけ金額を出す。他はマウスを乗せると出る
  const fewOn = points.filter((p) => highlight(p.month)).length <= 3;
  const bw = Math.min(28, iw * 0.62);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);

  return (
    <div ref={ref}>
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="月別収支の棒グラフ">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end">{shortYen(v)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1.5} />
      {points.map((p, i) => {
        const v = p.agg.balance;
        const cx = L + iw * i + iw / 2;
        const y0 = y(0), y1 = y(v);
        const on = highlight(p.month);
        return (
          <g key={p.month} opacity={on ? 1 : 0.45}>
            <title>{`${p.month}  収支 ${signedYen(v)}（投資 ${num(p.agg.stake)} / 払戻 ${num(p.agg.payout)}）`}</title>
            {v !== 0 && (
              <rect x={cx - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.max(1, Math.abs(y1 - y0))} fill={v > 0 ? 'var(--pos)' : 'var(--neg)'} rx={1.5} />
            )}
            {p.agg.tickets > 0 && (iw >= 38 || (on && fewOn)) && (
              <text className="val" x={cx} y={v >= 0 ? y1 - 4 : y1 + 11} textAnchor="middle">{shortYen(v)}</text>
            )}
            <text x={cx} y={H - 8} textAnchor="middle">{iw >= 30 || i === 0 ? `${+p.month.slice(5)}月` : +p.month.slice(5)}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** 回収率の横棒グラフ（100%の基準線あり）。 */
export function ReturnRateBars({ rows }: { rows: Array<{ key: string; rate: number | null; tickets: number }> }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const rowH = 26, L = 100, R = 64, T = 18;
  const H = T + rows.length * rowH + 8;
  const max = Math.max(1.5, ...rows.map((r) => r.rate ?? 0));
  const x = (r: number) => L + (r / max) * (W - L - R);
  const gridVals = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 10].filter((v) => v <= max);
  return (
    <div ref={ref}>
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="回収率の横棒グラフ">
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={T - 4} y2={H - 6} stroke={v === 1 ? 'var(--line-strong)' : 'var(--grid)'} strokeWidth={v === 1 ? 1.5 : 1} strokeDasharray={v === 1 ? '4 3' : undefined} />
          <text x={x(v)} y={T - 7} textAnchor="middle">{`${Math.round(v * 100)}%`}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cy = T + i * rowH + rowH / 2;
        const rate = r.rate ?? 0;
        return (
          <g key={r.key}>
            <title>{`${r.key}  回収率 ${pct(r.rate)}（${r.tickets}票）`}</title>
            <text x={L - 8} y={cy + 4} textAnchor="end" style={{ fontFamily: 'var(--body)', fontSize: 11, fill: 'var(--fg)' }}>{r.key}</text>
            <rect x={L} y={cy - 8} width={Math.max(0, x(rate) - L)} height={16} fill={rate >= 1 ? 'var(--pos)' : 'var(--neg)'} opacity={0.85} rx={1.5} />
            <text className="val" x={x(rate) + 5} y={cy + 4}>{pct(r.rate)}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}
