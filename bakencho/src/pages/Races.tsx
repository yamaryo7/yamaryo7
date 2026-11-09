// レース明細: 期間内のレースを日付降順で一覧。行を開くと票の表。払戻セルはその場で編集でき、入力した瞬間に集計が変わる。
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Modal, Pct, ResultBadge, Yen } from '../components/ui';
import { formatDateJa } from '../domain/date';
import { pct, signClass, signedYen, yen } from '../domain/format';
import { raceSummaries, summarize, summarizeRaces, ticketResult, type RaceResult, type RaceSummary } from '../domain/metrics';
import { parseYen } from '../domain/ticket';
import type { Race, Ticket } from '../domain/types';
import { useStore } from '../state/store';

type Filter = 'all' | RaceResult;
const FILTERS: Array<[Filter, string]> = [['all', 'すべて'], ['pending', '未確定'], ['hit', '的中'], ['miss', '不的中']];

export function Races() {
  const { data, range } = useStore();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [editRace, setEditRace] = useState<Race | null>(null);

  const all = useMemo(() => raceSummaries(data.races, data.tickets, range), [data.races, data.tickets, range]);
  const shown = filter === 'all' ? all : all.filter((s) => s.result === filter);
  const agg = useMemo(() => summarize(all.flatMap((s) => s.tickets)), [all]);
  const ra = useMemo(() => summarizeRaces(all), [all]);

  const toggle = (id: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <>
      <div className="summary-strip">
        <span>レース<b>{ra.races}</b></span>
        <span>票<b>{agg.tickets}</b></span>
        <span>投資<b>{yen(agg.stake)}</b></span>
        <span>払戻<b>{yen(agg.payout)}</b></span>
        <span>収支<b className={signClass(agg.balance)}>{signedYen(agg.balance)}</b></span>
        <span>回収率<b>{pct(agg.returnRate)}</b></span>
        <span>的中率(票)<b>{pct(agg.hitRate)}</b></span>
        <span>的中率(レース)<b>{pct(ra.hitRate)}</b></span>
        {agg.pending > 0 && <span>未確定<b style={{ color: 'var(--pend)' }}>{agg.pending}票</b></span>}
      </div>

      <div className="actions">
        <div className="seg" role="group" aria-label="結果で絞り込み">
          {FILTERS.map(([f, label]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}{f !== 'all' && <span className="faint"> {all.filter((s) => s.result === f).length}</span>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setOpen(new Set(shown.map((s) => s.race.id)))}>すべて開く</button>
        <button className="btn sm" onClick={() => setOpen(new Set())}>すべて閉じる</button>
      </div>

      <div className="card scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>開催日</th><th>競馬場</th><th className="r">R</th><th>レース名</th><th className="r">票</th>
              <th className="r">投資</th><th className="r">払戻</th><th className="r">収支</th><th className="r">回収率</th><th>結果</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td className="empty" colSpan={11}>この期間・条件のレースはありません</td></tr>}
            {shown.map((s) => {
              const isOpen = open.has(s.race.id);
              return (
                <Fragment key={s.race.id}>
                  <tr
                    className={`clickable ${isOpen ? 'open' : ''}`}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggle(s.race.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.race.id); }
                    }}
                  >
                    <td className="c">
                      <svg className={`caret ${isOpen ? 'open' : ''}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </td>
                    <td className="num">{formatDateJa(s.race.date)}</td>
                    <td>{s.race.course}</td>
                    <td className="r">{s.race.race_no}</td>
                    <td>{s.race.name ?? <span className="faint">—</span>}</td>
                    <td className="r">{s.agg.tickets}</td>
                    <td className="r"><Yen v={s.agg.stake} /></td>
                    <td className="r"><Yen v={s.agg.payout} /></td>
                    <td className="r"><Yen v={s.agg.balance} signed /></td>
                    <td className="r"><Pct r={s.agg.returnRate} /></td>
                    <td><ResultBadge result={s.result} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="sub-row">
                      <td colSpan={11}>
                        <TicketTable summary={s} onEditRace={() => setEditRace(s.race)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {editRace && <EditRaceModal race={editRace} onClose={() => setEditRace(null)} />}
    </>
  );
}

function TicketTable({ summary, onEditRace }: { summary: RaceSummary; onEditRace: () => void }) {
  const { deleteTicket, deleteRace, confirm, toast, setPrefill } = useStore();
  const { race, tickets, agg } = summary;

  async function onDeleteTicket(t: Ticket) {
    const ok = await confirm({
      title: '票を削除',
      message: <>「{t.bet_type} {t.selection}（{yen(t.stake)}）」を削除します。元に戻せません。</>,
      confirmLabel: '削除する',
      danger: true,
    });
    if (ok) {
      await deleteTicket(t.id);
      toast('票を削除しました');
    }
  }

  async function onDeleteRace() {
    const ok = await confirm({
      title: 'レースを削除',
      message: <>{race.date} {race.course}{race.race_no}R と、その票 {tickets.length} 件を削除します。元に戻せません。</>,
      confirmLabel: '削除する',
      danger: true,
    });
    if (ok) {
      await deleteRace(race.id);
      toast('レースを削除しました');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <table className="grid" style={{ background: 'var(--surface)' }}>
        <thead>
          <tr>
            <th>券種</th><th>買い方</th><th>買い目</th><th className="r">点数</th><th className="r">購入</th><th className="r">払戻</th><th>結果</th><th className="r">回収率</th><th></th>
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 && <tr><td className="empty" colSpan={9}>票がありません</td></tr>}
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>{t.bet_type}</td>
              <td>{t.method}</td>
              <td className="num">{t.selection || <span className="faint">—</span>}</td>
              <td className="r">{t.points > 1 ? <span title={`${yen(t.unit_price)} × ${t.points}点`}>{t.points}</span> : t.points}</td>
              <td className="r"><Yen v={t.stake} /></td>
              <td className="r"><PayoutCell ticket={t} /></td>
              <td><ResultBadge result={ticketResult(t)} /></td>
              <td className="r">{t.payout === null ? <span className="faint">—</span> : <Pct r={t.payout / t.stake} />}</td>
              <td className="c">
                <button className="btn ghost sm" onClick={() => void onDeleteTicket(t)} aria-label="この票を削除" title="この票を削除">×</button>
              </td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={4}>レース計（的中率 {pct(agg.hitRate)}）</td>
            <td className="r"><Yen v={agg.stake} /></td>
            <td className="r"><Yen v={agg.payout} /></td>
            <td><Yen v={agg.balance} signed /></td>
            <td className="r"><Pct r={agg.returnRate} /></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <div className="actions">
        {race.note && <span className="muted small">メモ: {race.note}</span>}
        <span className="spacer" />
        <button className="btn sm" onClick={() => setPrefill({ date: race.date, course: race.course, race_no: race.race_no, name: race.name ?? '' })}>このレースに票を追加</button>
        <button className="btn sm" onClick={onEditRace}>レース名・メモを編集</button>
        <button className="btn sm danger" onClick={() => void onDeleteRace()}>レースを削除</button>
      </div>
    </div>
  );
}

/** 払戻のその場編集。打った瞬間に保存し、KPIが動く。空欄＝未確定、0＝不的中。 */
function PayoutCell({ ticket }: { ticket: Ticket }) {
  const { setPayout } = useStore();
  const [text, setText] = useState(ticket.payout === null ? '' : ticket.payout.toLocaleString('ja-JP'));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused) setText(ticket.payout === null ? '' : ticket.payout.toLocaleString('ja-JP'));
  }, [ticket.payout, focused]);

  return (
    <input
      className="cell"
      value={text}
      placeholder="未確定"
      aria-label={`${ticket.bet_type} ${ticket.selection} の払戻`}
      aria-invalid={invalid}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseYen(e.target.value);
        if (v !== null && Number.isNaN(v)) { setInvalid(true); return; }
        setInvalid(false);
        void setPayout(ticket.id, v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          // 次の払戻セルへ
          e.preventDefault();
          const cells = [...document.querySelectorAll<HTMLInputElement>('input.cell')];
          const i = cells.indexOf(e.currentTarget);
          (cells[i + (e.shiftKey ? -1 : 1)] ?? e.currentTarget).focus();
        } else if (e.key === 'Escape') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function EditRaceModal({ race, onClose }: { race: Race; onClose: () => void }) {
  const { updateRace, toast } = useStore();
  const [name, setName] = useState(race.name ?? '');
  const [note, setNote] = useState(race.note ?? '');
  const save = async () => {
    await updateRace({ ...race, name: name.trim() || null, note: note.trim() || null });
    toast('レースを更新しました');
    onClose();
  };
  return (
    <Modal
      title={`${race.date} ${race.course}${race.race_no}R`}
      onClose={onClose}
      footer={<><span className="spacer" /><button className="btn" onClick={onClose}>キャンセル</button><button className="btn primary" onClick={() => void save()}>保存</button></>}
    >
      <label className="f"><span>レース名</span><input data-autofocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} /></label>
      <label className="f"><span>メモ</span><input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} /></label>
    </Modal>
  );
}
