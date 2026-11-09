// 分析: 切り口（券種／買い方／競馬場／月／曜日）をタブで切り替え、テーブルと回収率の横棒グラフを出す。
import { useMemo, useState } from 'react';
import { ReturnRateBars } from '../components/Charts';
import { Card } from '../components/ui';
import { formatMonthJa } from '../domain/date';
import { breakdown, DIMENSION_LABEL, kpi, type Dimension } from '../domain/metrics';
import { useStore } from '../state/store';
import { BreakdownTable } from './BreakdownTable';

const DIMS: Dimension[] = ['betType', 'method', 'course', 'month', 'weekday'];

export function Analysis() {
  const { data, range } = useStore();
  const [dim, setDim] = useState<Dimension>('betType');
  const rows = useMemo(() => breakdown(dim, data.races, data.tickets, range), [dim, data.races, data.tickets, range]);
  const total = useMemo(() => kpi(data.races, data.tickets, range).agg, [data.races, data.tickets, range]);
  const fmt = dim === 'month' ? formatMonthJa : dim === 'weekday' ? (k: string) => (k === 'その他' ? '平日・その他' : `${k}曜`) : undefined;

  return (
    <>
      <div className="tabs" role="tablist" aria-label="切り口">
        {DIMS.map((d, i) => (
          <button
            key={d}
            role="tab"
            aria-selected={dim === d}
            onClick={() => setDim(d)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const n = DIMS[(i + (e.key === 'ArrowRight' ? 1 : DIMS.length - 1)) % DIMS.length];
                setDim(n);
                (e.currentTarget.parentElement?.children[DIMS.indexOf(n)] as HTMLElement | undefined)?.focus();
              }
            }}
          >
            {DIMENSION_LABEL[d]}別
          </button>
        ))}
      </div>
      <Card title={`${DIMENSION_LABEL[dim]}別の成績`} bodyClass="">
        <BreakdownTable rows={rows} keyLabel={DIMENSION_LABEL[dim]} total={total} formatKey={fmt} />
      </Card>
      <Card title="回収率" actions={<span className="legend"><span>点線＝100%（収支トントン）</span></span>}>
        {rows.length === 0 ? (
          <div className="muted c" style={{ padding: 20 }}>この期間の馬券はありません</div>
        ) : (
          <ReturnRateBars rows={rows.map((r) => ({ key: fmt ? fmt(r.key) : r.key, rate: r.agg.returnRate, tickets: r.agg.tickets }))} />
        )}
      </Card>
    </>
  );
}
