// 期間切替。競馬・家計簿で共通。切り替えると全画面の数字が同時に変わる。
import { useMemo } from 'react';
import { addMonths, formatMonthJa, monthOf } from '../domain/date';
import { periodLabel, type Period } from '../domain/period';
import { useStore } from '../state/store';

const PRESETS: Array<{ kind: 'thisMonth' | 'lastMonth' | 'thisYear' | 'all'; label: string }> = [
  { kind: 'thisMonth', label: '今月' },
  { kind: 'lastMonth', label: '先月' },
  { kind: 'thisYear', label: '今年' },
  { kind: 'all', label: '全期間' },
];

export function PeriodBar() {
  const { period, setPeriod, today, data } = useStore();

  // 月の選択肢: データのある月＋直近24か月
  const months = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < 24; i++) set.add(addMonths(monthOf(today), -i));
    for (const r of data.races) set.add(monthOf(r.date));
    for (const h of data.household) set.add(monthOf(h.date));
    return [...set].sort().reverse();
  }, [today, data.races, data.household]);

  const isRange = period.kind === 'range';
  const set = (p: Period) => setPeriod(p);

  return (
    <div className="period" role="group" aria-label="期間">
      <div className="seg">
        {PRESETS.map((p) => (
          <button key={p.kind} aria-pressed={period.kind === p.kind} onClick={() => set({ kind: p.kind })}>{p.label}</button>
        ))}
      </div>
      <select
        aria-label="月を指定"
        style={{ width: 120 }}
        value={period.kind === 'month' ? period.month : ''}
        onChange={(e) => e.target.value && set({ kind: 'month', month: e.target.value })}
      >
        <option value="">月を指定…</option>
        {months.map((m) => <option key={m} value={m}>{formatMonthJa(m)}</option>)}
      </select>
      <div className="seg">
        <button
          aria-pressed={isRange}
          onClick={() => set(isRange ? { kind: 'thisMonth' } : { kind: 'range', from: `${monthOf(today)}-01`, to: today })}
        >
          期間指定
        </button>
      </div>
      {isRange && (
        <>
          <input type="date" aria-label="開始日" style={{ width: 140 }} value={period.from} onChange={(e) => e.target.value && set({ ...period, from: e.target.value })} />
          <span className="muted">〜</span>
          <input type="date" aria-label="終了日" style={{ width: 140 }} value={period.to} onChange={(e) => e.target.value && set({ ...period, to: e.target.value })} />
        </>
      )}
      <span className="period-label">{periodLabel(period, today)}</span>
    </div>
  );
}
