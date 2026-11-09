// 家計簿: 期間は競馬と共通。競馬の行は票から自動で載り（薄い色、削除不可）、他の費目は右ペインで手入力。
import { useMemo, useState } from 'react';
import { Card, Kpi, Yen } from '../components/ui';
import { formatDateJa } from '../domain/date';
import { num, pct, signClass, signedYen, yen } from '../domain/format';
import { byCategory, householdKpi, ledger, type LedgerRow } from '../domain/household';
import { useStore } from '../state/store';
import { requestEditHousehold } from '../panels/HouseholdInputPanel';

type KindFilter = 'all' | 'expense' | 'income' | 'keiba' | 'manual';

export function Household() {
  const { data, range, deleteHousehold, confirm, toast } = useStore();
  const [filter, setFilter] = useState<KindFilter>('all');
  const rows = useMemo(() => ledger(data.household, data.races, data.tickets, range), [data.household, data.races, data.tickets, range]);
  const k = useMemo(() => householdKpi(rows), [rows]);
  const order = useMemo(() => [...data.categories].sort((a, b) => a.sort_order - b.sort_order).map((c) => c.name), [data.categories]);
  const cats = useMemo(() => byCategory(rows, order), [rows, order]);

  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'keiba' ? r.auto : filter === 'manual' ? !r.auto : r.kind === filter,
  );

  async function onDelete(r: LedgerRow) {
    const ok = await confirm({
      title: '家計簿の行を削除',
      message: <>{r.date}「{r.category}」{yen(r.amount)}{r.memo ? `（${r.memo}）` : ''} を削除します。</>,
      confirmLabel: '削除する',
      danger: true,
    });
    if (ok) {
      await deleteHousehold(r.id);
      toast('削除しました');
    }
  }

  const expenseCats = cats.filter((c) => c.kind === 'expense');
  const incomeCats = cats.filter((c) => c.kind === 'income');

  return (
    <>
      <div className="kpis">
        <Kpi label="収支" value={signedYen(k.balance)} className={signClass(k.balance)} sub={`収入 ${num(k.income)} ／ 支出 ${num(k.expense)}`} />
        <Kpi label="支出" value={yen(k.expense)} sub={`うち競馬 ${yen(k.keibaExpense)}`} />
        <Kpi label="支出のうち競馬の比率" value={pct(k.keibaShare)} sub="競馬の購入額 ÷ 支出合計" />
        <Kpi
          label="競馬の純支出"
          value={yen(Math.abs(k.keibaNetSpend))}
          className={k.keibaNetSpend > 0 ? 'neg' : k.keibaNetSpend < 0 ? 'pos' : ''}
          sub={`${k.keibaNetSpend > 0 ? '持ち出し' : k.keibaNetSpend < 0 ? '黒字' : '±0'}：購入 ${num(k.keibaExpense)} − 払戻 ${num(k.keibaIncome)}`}
        />
      </div>

      <div className="two">
        <Card title="費目別（支出）" bodyClass="">
          <CategoryTable rows={expenseCats} total={k.expense} />
        </Card>
        <Card title="費目別（収入）" bodyClass="">
          <CategoryTable rows={incomeCats} total={k.income} />
        </Card>
      </div>

      <Card
        title="明細"
        bodyClass="scroll-x"
        actions={
          <div className="seg" role="group" aria-label="明細の絞り込み">
            {([['all', 'すべて'], ['expense', '支出'], ['income', '収入'], ['keiba', '競馬のみ'], ['manual', '手入力のみ']] as Array<[KindFilter, string]>).map(([f, l]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
            ))}
          </div>
        }
      >
        <table className="grid">
          <thead>
            <tr><th>日付</th><th>区分</th><th>費目</th><th>メモ</th><th className="r">金額</th><th>出どころ</th><th></th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td className="empty" colSpan={7}>この期間の明細はありません</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={r.auto ? 'auto' : ''}>
                <td className="num">{formatDateJa(r.date)}</td>
                <td>{r.kind === 'income' ? '収入' : '支出'}</td>
                <td>{r.category}</td>
                <td>{r.memo}</td>
                <td className={`r ${r.auto ? '' : r.kind === 'income' ? 'pos' : ''}`}>{r.kind === 'income' ? '+' : '−'}{yen(r.amount)}</td>
                <td>{r.auto ? <span className="badge auto">競馬収支から</span> : <span className="faint small">手入力</span>}</td>
                <td className="c nowrap">
                  {!r.auto && (
                    <>
                      <button className="btn ghost sm" onClick={() => requestEditHousehold(r)}>編集</button>
                      <button className="btn ghost sm" onClick={() => void onDelete(r)} aria-label="削除" title="削除">×</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function CategoryTable({ rows, total }: { rows: ReturnType<typeof byCategory>; total: number }) {
  return (
    <table className="grid">
      <thead>
        <tr><th>費目</th><th className="r">件数</th><th className="r">金額</th><th className="r">構成比</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td className="empty" colSpan={4}>この期間はありません</td></tr>}
        {rows.map((c) => (
          <tr key={c.category}>
            <td>{c.category}{c.category === '競馬' && <span className="badge auto" style={{ marginLeft: 6 }}>自動</span>}</td>
            <td className="r">{c.count}</td>
            <td className="r"><Yen v={c.amount} /></td>
            <td className="r">{pct(c.share)}</td>
          </tr>
        ))}
        {rows.length > 0 && (
          <tr className="total"><td>計</td><td className="r">{rows.reduce((s, c) => s + c.count, 0)}</td><td className="r"><Yen v={total} /></td><td className="r">100.0%</td></tr>
        )}
      </tbody>
    </table>
  );
}
