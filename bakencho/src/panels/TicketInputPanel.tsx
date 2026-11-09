// 右ペインの馬券入力。1レースに複数の票を縦に積む。
// Tab で次の項目、Enter で票の行を追加、Ctrl/Cmd+Enter で保存。保存後は同じ開催日・競馬場のまま次のレース番号へ。
import { useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField';
import { isValidDate } from '../domain/date';
import { yen } from '../domain/format';
import { calcPoints, selectionPlaceholder } from '../domain/points';
import { parseYen, validateDraft, type TicketDraft } from '../domain/ticket';
import { BET_TYPES, COURSES, METHODS, type BetType, type Method } from '../domain/types';
import { useStore } from '../state/store';

interface RowState {
  key: number;
  bet_type: BetType;
  method: Method;
  selection: string;
  pointsText: string;
  pointsManual: boolean;
  unitText: string;
  payoutText: string;
}

const LS_KEY = 'bakencho-input-defaults';
interface Defaults { course: string; bet_type: BetType; method: Method; unit: string }
function loadDefaults(): Defaults {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    return { course: d.course || '東京', bet_type: BET_TYPES.includes(d.bet_type) ? d.bet_type : '馬連', method: METHODS.includes(d.method) ? d.method : '通常', unit: d.unit || '100' };
  } catch {
    return { course: '東京', bet_type: '馬連', method: '通常', unit: '100' };
  }
}
function saveDefaults(d: Defaults) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* 無視 */ }
}

let rowSeq = 0;
const newRow = (base?: Partial<RowState>): RowState => ({
  key: ++rowSeq, bet_type: '馬連', method: '通常', selection: '', pointsText: '1', pointsManual: false, unitText: '100', payoutText: '', ...base,
});

function rowPoints(r: RowState): { points: number | null; auto: number | null } {
  const auto = calcPoints(r.bet_type, r.method, r.selection);
  if (!r.pointsManual && auto !== null) return { points: auto, auto };
  const p = parseYen(r.pointsText);
  return { points: p !== null && Number.isInteger(p) && p > 0 ? p : null, auto };
}

function rowStake(r: RowState): number | null {
  const { points } = rowPoints(r);
  const unit = parseYen(r.unitText);
  return points !== null && unit !== null && !Number.isNaN(unit) && unit > 0 ? unit * points : null;
}

const isBlank = (r: RowState) => r.selection.trim() === '' && r.payoutText.trim() === '';

export function TicketInputPanel() {
  const store = useStore();
  const { data, today, prefill, setPrefill, saveRace, toast, confirmReq } = store;
  const init = useMemo(loadDefaults, []);
  const [date, setDate] = useState(today);
  const [course, setCourse] = useState(init.course);
  const [raceNo, setRaceNo] = useState('11');
  const [name, setName] = useState('');
  const [rows, setRows] = useState<RowState[]>([newRow({ bet_type: init.bet_type, method: init.method, unitText: init.unit })]);
  const [errors, setErrors] = useState<Partial<Record<number | "race", string>>>({});
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusKey = useRef<number | null>(null);

  // 新しく足した行の券種へフォーカス
  useEffect(() => {
    if (focusKey.current === null) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-row="${focusKey.current}"] select`)?.focus();
    focusKey.current = null;
  }, [rows]);

  // レース明細の「このレースに票を追加」
  useEffect(() => {
    if (!prefill) return;
    setDate(prefill.date);
    setCourse(prefill.course);
    setRaceNo(String(prefill.race_no));
    setName(prefill.name);
    setPrefill(null);
    focusKey.current = rows[0].key;
    setRows((rs) => [...rs]);
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const raceDates = useMemo(() => new Set(data.races.map((r) => r.date)), [data.races]);
  const no = Number(raceNo);
  const existing = data.races.find((r) => r.date === date && r.course === course.trim() && r.race_no === no);
  const existingCount = existing ? data.tickets.filter((t) => t.race_id === existing.id).length : 0;

  const update = (key: number, patch: Partial<RowState>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRowAfter = (key: number) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const src = rs[i];
      const nr = newRow({ bet_type: src.bet_type, method: src.method, unitText: src.unitText });
      focusKey.current = nr.key;
      return [...rs.slice(0, i + 1), nr, ...rs.slice(i + 1)];
    });
  };
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow({ bet_type: rs[0].bet_type, method: rs[0].method, unitText: rs[0].unitText })]));

  const total = rows.reduce((s, r) => s + (rowStake(r) ?? 0), 0);
  const filled = rows.filter((r) => !isBlank(r));

  async function save() {
    if (saving) return;
    const errs: Partial<Record<number | "race", string>> = {};
    if (!isValidDate(date)) errs.race = '開催日を YYYY-MM-DD で入力してください';
    else if (!course.trim()) errs.race = '競馬場を入力してください';
    else if (!Number.isInteger(no) || no < 1 || no > 99) errs.race = 'レース番号は1〜99の整数で入力してください';

    const target = filled.length > 0 ? filled : rows.slice(0, 1);
    const drafts: TicketDraft[] = [];
    for (const r of target) {
      const { points } = rowPoints(r);
      const unit = parseYen(r.unitText);
      const payout = parseYen(r.payoutText);
      if (r.selection.trim() === '' && r.bet_type !== 'その他') { errs[r.key] = '買い目を入力してください'; continue; }
      if (points === null) { errs[r.key] = '点数を入力してください（買い目から計算できません）'; continue; }
      if (unit === null || Number.isNaN(unit) || unit <= 0) { errs[r.key] = '1点金額を入力してください'; continue; }
      if (Number.isNaN(payout)) { errs[r.key] = '払戻は数字で入力してください（空欄＝未確定）'; continue; }
      const d: TicketDraft = { bet_type: r.bet_type, method: r.method, selection: r.selection, unit_price: unit, points, payout };
      const v = validateDraft(d);
      if (v) { errs[r.key] = v; continue; }
      drafts.push(d);
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await saveRace({ date, course: course.trim(), race_no: no, name }, drafts);
      toast(`${course.trim()}${no}R に ${res.added}票を保存しました（${yen(drafts.reduce((s, d) => s + d.unit_price * d.points, 0))}）`);
      const last = target[target.length - 1];
      saveDefaults({ course: course.trim(), bet_type: last.bet_type, method: last.method, unit: last.unitText });
      // 同じ開催日・競馬場のまま次のレースへ
      setRaceNo(String(Math.min(no + 1, 12)));
      setName('');
      const nr = newRow({ bet_type: last.bet_type, method: last.method, unitText: last.unitText });
      focusKey.current = nr.key;
      setRows([nr]);
    } catch {
      // エラーはストア側でトースト表示済み
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd+Enter で保存（パネルの外にフォーカスがあっても有効。モーダル表示中は無効）
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirmReq && !document.querySelector('.modal-back')) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmReq]);

  const onRowKey = (key: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addRowAfter(key);
    }
  };

  return (
    <div className="panel" ref={rootRef} aria-label="馬券入力">
      <div className="panel-head">
        <h2>馬券を入力</h2>
        <div className="hint">1レースに何票でも積めます。払戻は後からレース明細で入力できます。</div>
      </div>
      <div className="panel-body">
        <div className="race-fields">
          <label className="f wide">
            <span>開催日</span>
            <DateField value={date} onChange={setDate} today={today} marked={raceDates} aria-label="開催日" />
          </label>
          <label className="f">
            <span>競馬場</span>
            <input list="course-list" value={course} onChange={(e) => setCourse(e.target.value)} onFocus={(e) => e.target.select()} />
            <datalist id="course-list">{COURSES.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="f">
            <span>レース番号</span>
            <input type="number" className="num" min={1} max={12} value={raceNo} onChange={(e) => setRaceNo(e.target.value)} onFocus={(e) => e.target.select()} />
          </label>
          <label className="f wide">
            <span>レース名（任意）</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={existing?.name ?? '例：天皇賞（秋）'} />
          </label>
        </div>
        {errors.race && <div className="form-error">{errors.race}</div>}
        {existing && <div className="notice ok small">登録済みのレース（{existingCount}票）に追加します</div>}

        <div className="tickets-head">
          <span>票（{rows.length}）</span>
          <span className="faint">Enter で行を追加</span>
        </div>

        {rows.map((r, i) => {
          const { points, auto } = rowPoints(r);
          const stake = rowStake(r);
          const showAuto = !r.pointsManual && auto !== null;
          return (
            <div className="trow" key={r.key} data-row={r.key} onKeyDown={onRowKey(r.key)}>
              <div className="line l1">
                <label className="f">
                  <span>券種</span>
                  <select value={r.bet_type} onChange={(e) => update(r.key, { bet_type: e.target.value as BetType })} aria-label={`${i + 1}票目の券種`}>
                    {BET_TYPES.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <label className="f">
                  <span>買い方</span>
                  <select value={r.method} onChange={(e) => update(r.key, { method: e.target.value as Method })}>
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <button type="button" className="x" tabIndex={-1} onClick={() => removeRow(r.key)} aria-label={`${i + 1}票目を削除`} title="この票を削除">×</button>
              </div>
              <label className="f">
                <span>買い目</span>
                <input
                  className="num"
                  style={{ textAlign: 'left' }}
                  value={r.selection}
                  placeholder={selectionPlaceholder(r.bet_type, r.method)}
                  aria-invalid={!!errors[r.key] && r.selection.trim() === ''}
                  onChange={(e) => update(r.key, { selection: e.target.value })}
                />
              </label>
              <div className="line l3">
                <label className="f">
                  <span>
                    点数{' '}
                    {r.pointsManual && auto !== null && (
                      <button type="button" className="auto-tag" tabIndex={-1} onClick={() => update(r.key, { pointsManual: false })}>自動</button>
                    )}
                  </span>
                  <input
                    className="num"
                    value={showAuto ? String(auto) : r.pointsText}
                    title={showAuto ? '買い目から自動計算（上書き可）' : undefined}
                    style={showAuto ? { color: 'var(--turf)' } : undefined}
                    onChange={(e) => update(r.key, { pointsText: e.target.value, pointsManual: true })}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <label className="f">
                  <span>1点金額</span>
                  <input className="num" value={r.unitText} onChange={(e) => update(r.key, { unitText: e.target.value })} onFocus={(e) => e.target.select()} />
                </label>
                <label className="f">
                  <span>払戻（任意）</span>
                  <input className="num" value={r.payoutText} placeholder="未確定" onChange={(e) => update(r.key, { payoutText: e.target.value })} />
                </label>
                <div className="stake" title="購入額 = 1点金額 × 点数">{stake === null ? '—' : yen(stake)}</div>
              </div>
              {points !== null && points > 1 && stake !== null && (
                <div className="faint small num">{r.unitText}円 × {points}点</div>
              )}
              {errors[r.key] && <div className="err">{errors[r.key]}</div>}
            </div>
          );
        })}
        <button type="button" className="btn sm" onClick={() => addRowAfter(rows[rows.length - 1].key)}>＋ 票を追加</button>
      </div>
      <div className="panel-foot">
        <div className="total-line" style={{ marginBottom: 8 }}>
          <span>このレースの購入計（{filled.length}票）</span>
          <span className="num">{yen(total)}</span>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => { setRows([newRow({ bet_type: rows[0].bet_type, method: rows[0].method, unitText: rows[0].unitText })]); setErrors({}); }}>クリア</button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>
            保存 <span className="kbd">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</span>
          </button>
        </div>
        <div className="shortcut-help" style={{ marginTop: 8 }}>
          <kbd>Tab</kbd> 次の項目　<kbd>Enter</kbd> 票を追加　開催日で <kbd>↑</kbd><kbd>↓</kbd> 1日ずつ
        </div>
      </div>
    </div>
  );
}
