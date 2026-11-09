// ダッシュボード（起動時）: KPI4つ、券種別テーブル、月別収支の棒グラフ、直近のレース。
import { useMemo } from 'react';
import { MonthlyBalanceChart } from '../components/Charts';
import { Card, Kpi, Pct, ResultBadge, Yen } from '../components/ui';
import { formatDateJa, monthOf } from '../domain/date';
import { num, pct, signClass, signedYen } from '../domain/format';
import { breakdown, kpi, monthlySeries, raceSummaries } from '../domain/metrics';
import { useStore } from '../state/store';
import { BreakdownTable } from './BreakdownTable';

export function Dashboard() {
  const { data, range, today, setPage, loadSample } = useStore();
  const { races, tickets } = data;

  const k = useMemo(() => kpi(races, tickets, range), [races, tickets, range]);
  const byType = useMemo(() => breakdown('betType', races, tickets, range), [races, tickets, range]);
  // 月別: 選択期間の最終月までの12か月（全期間なら今月まで）
  const endMonth = range ? (monthOf(range.to) > monthOf(today) ? monthOf(today) : monthOf(range.to)) : monthOf(today);
  const series = useMemo(() => monthlySeries(races, tickets, endMonth, 12), [races, tickets, endMonth]);
  const recent = useMemo(() => raceSummaries(races, tickets, range).slice(0, 10), [races, tickets, range]);

  if (races.length === 0) {
    return (
      <div className="empty-state">
        <h2>まだ馬券がありません</h2>
        <div>右の入力パネルから最初のレースを登録してください。動きを確かめたい場合はサンプルデータを入れられます。</div>
        <div className="actions">
          <button className="btn primary" onClick={() => void loadSample()}>サンプルデータを入れる</button>
          <button className="btn" onClick={() => setPage('settings')}>Excel/JSONから取り込む</button>
        </div>
      </div>
    );
  }

  const a = k.agg, ra = k.raceAgg;
  return (
    <>
      <div className="kpis">
        <Kpi label="収支" value={signedYen(a.balance)} className={signClass(a.balance)} sub={`投資 ${num(a.stake)} ／ 払戻 ${num(a.payout)}`} />
        <Kpi label="回収率" value={pct(a.returnRate)} className={a.returnRate === null ? '' : a.returnRate >= 1 ? 'pos' : 'neg'} sub="払戻 ÷ 投資" />
        <Kpi label="的中率（票）" value={pct(a.hitRate)} sub={`${a.hits} ／ ${a.settled}票${a.pending ? `　未確定 ${a.pending}` : ''}`} />
        <Kpi label="的中率（レース）" value={pct(ra.hitRate)} sub={`${ra.hits} ／ ${ra.settled}レース${ra.pending ? `　未確定 ${ra.pending}` : ''}`} />
      </div>

      <div className="two wide-left">
        <Card title="券種別" bodyClass="">
          <BreakdownTable rows={byType} keyLabel="券種" total={a} compact />
        </Card>
        <Card
          title="月別収支（12か月）"
          actions={<div className="legend"><span><i style={{ background: 'var(--pos)' }} />プラス</span><span><i style={{ background: 'var(--neg)' }} />マイナス</span></div>}
        >
          <MonthlyBalanceChart points={series} highlight={(m) => range === null || (monthOf(range.from) <= m && m <= monthOf(range.to))} />
        </Card>
      </div>

      <Card title="直近のレース" actions={<button className="btn sm" onClick={() => setPage('races')}>レース明細へ</button>} bodyClass="scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th>開催日</th><th>レース</th><th className="r">票</th><th className="r">投資</th><th className="r">払戻</th><th className="r">収支</th><th className="r">回収率</th><th>結果</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <tr><td className="empty" colSpan={8}>この期間のレースはありません</td></tr>}
            {recent.map((s) => (
              <tr key={s.race.id}>
                <td className="num">{formatDateJa(s.race.date)}</td>
                <td>{s.race.course} {s.race.race_no}R <span className="muted">{s.race.name ?? ''}</span></td>
                <td className="r">{s.agg.tickets}</td>
                <td className="r"><Yen v={s.agg.stake} /></td>
                <td className="r"><Yen v={s.agg.payout} /></td>
                <td className="r"><Yen v={s.agg.balance} signed /></td>
                <td className="r"><Pct r={s.agg.returnRate} /></td>
                <td><ResultBadge result={s.result} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
