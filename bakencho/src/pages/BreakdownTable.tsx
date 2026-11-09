// 切り口別テーブル（票数・的中票数・的中率・投資・払戻・収支・回収率）。
// compact はダッシュボードの半幅カード用（的中票数と収支の列を省く）。
import { Pct, Yen } from '../components/ui';
import type { Agg, BreakdownRow } from '../domain/metrics';

interface Props {
  rows: BreakdownRow[];
  keyLabel: string;
  total: Agg;
  formatKey?: (k: string) => string;
  compact?: boolean;
}

export function BreakdownTable({ rows, keyLabel, total, formatKey, compact = false }: Props) {
  const cols = compact ? 6 : 8;
  const line = (label: string, agg: Agg) => (
    <>
      <td>{label}</td>
      <td className="r">{agg.tickets}</td>
      {!compact && <td className="r">{agg.hits}</td>}
      <td className="r" title={`${agg.hits} ／ ${agg.settled}票`}><Pct r={agg.hitRate} /></td>
      <td className="r"><Yen v={agg.stake} /></td>
      <td className="r"><Yen v={agg.payout} /></td>
      {!compact && <td className="r"><Yen v={agg.balance} signed /></td>}
      <td className="r"><Pct r={agg.returnRate} colorize /></td>
    </>
  );
  return (
    <div className="scroll-x">
      <table className={`grid ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>{keyLabel}</th>
            <th className="r">票数</th>
            {!compact && <th className="r">的中</th>}
            <th className="r">的中率</th>
            <th className="r">投資</th>
            <th className="r">払戻</th>
            {!compact && <th className="r">収支</th>}
            <th className="r">回収率</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className="empty" colSpan={cols}>この期間の馬券はありません</td></tr>}
          {rows.map(({ key, agg }) => <tr key={key}>{line(formatKey ? formatKey(key) : key, agg)}</tr>)}
          {rows.length > 0 && <tr className="total">{line('計', total)}</tr>}
        </tbody>
      </table>
    </div>
  );
}
