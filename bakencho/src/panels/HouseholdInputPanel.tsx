// 右ペインの家計入力（家計簿画面のとき）。競馬の行はここでは入力しない（票から自動で載る）。
import { useEffect, useRef, useState } from 'react';
import { DateField } from '../components/DateField';
import { isValidDate } from '../domain/date';
import { parseYen } from '../domain/ticket';
import { KEIBA_CATEGORY, type EntryKind, type HouseholdEntry } from '../domain/types';
import { useStore } from '../state/store';

export const EDIT_HOUSEHOLD_EVENT = 'bakencho:edit-household';

export function requestEditHousehold(h: HouseholdEntry) {
  window.dispatchEvent(new CustomEvent<HouseholdEntry>(EDIT_HOUSEHOLD_EVENT, { detail: h }));
}

export function HouseholdInputPanel() {
  const { data, today, addHousehold, updateHousehold, toast, confirmReq } = useStore();
  const [editing, setEditing] = useState<HouseholdEntry | null>(null);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<EntryKind>('expense');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const cats = data.categories.filter((c) => c.kind === kind).sort((a, b) => a.sort_order - b.sort_order);
  useEffect(() => {
    if (!cats.some((c) => c.name === category)) setCategory(cats[0]?.name ?? '');
  }, [kind, data.categories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onEdit = (e: Event) => {
      const h = (e as CustomEvent<HouseholdEntry>).detail;
      setEditing(h);
      setDate(h.date);
      setKind(h.kind);
      setCategory(h.category);
      setAmount(String(h.amount));
      setMemo(h.memo);
      setError('');
      setTimeout(() => amountRef.current?.focus(), 0);
    };
    window.addEventListener(EDIT_HOUSEHOLD_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_HOUSEHOLD_EVENT, onEdit);
  }, []);

  const reset = () => {
    setEditing(null);
    setAmount('');
    setMemo('');
    setError('');
    amountRef.current?.focus();
  };

  async function save() {
    const a = parseYen(amount);
    if (!isValidDate(date)) return setError('日付を YYYY-MM-DD で入力してください');
    if (!category) return setError('費目を選んでください');
    if (category === KEIBA_CATEGORY) return setError('「競馬」は馬券の入力から自動で載ります');
    if (a === null || Number.isNaN(a) || a <= 0) return setError('金額を1円以上の整数で入力してください');
    const entry = { date, kind, category, memo: memo.trim(), amount: a };
    try {
      if (editing) {
        await updateHousehold({ ...entry, id: editing.id });
        toast('家計簿の行を更新しました');
      } else {
        await addHousehold(entry);
        toast(`${kind === 'income' ? '収入' : '支出'}「${category}」${a.toLocaleString('ja-JP')}円を追加しました`);
      }
      reset();
    } catch {
      // ストアでトースト済み
    }
  }

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

  const enterSaves = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="panel" aria-label="家計入力">
      <div className="panel-head">
        <h2>{editing ? '家計簿の行を編集' : '家計を入力'}</h2>
        <div className="hint">競馬の購入・払戻は馬券の入力から自動で載ります。</div>
      </div>
      <div className="panel-body">
        <label className="f">
          <span>日付</span>
          <DateField value={date} onChange={setDate} today={today} aria-label="日付" />
        </label>
        <div className="f" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          <span>区分</span>
          <div className="seg" role="radiogroup" aria-label="区分">
            <button type="button" role="radio" aria-checked={kind === 'expense'} aria-pressed={kind === 'expense'} onClick={() => setKind('expense')} style={{ flex: 1 }}>支出</button>
            <button type="button" role="radio" aria-checked={kind === 'income'} aria-pressed={kind === 'income'} onClick={() => setKind('income')} style={{ flex: 1 }}>収入</button>
          </div>
        </div>
        <label className="f">
          <span>費目</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="f">
          <span>金額（円）</span>
          <input ref={amountRef} className="num" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={enterSaves} placeholder="3,200" />
        </label>
        <label className="f">
          <span>メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} onKeyDown={enterSaves} placeholder="スーパー" />
        </label>
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="panel-foot">
        <div className="actions">
          {editing && <button type="button" className="btn ghost" onClick={reset}>編集をやめる</button>}
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={() => void save()}>
            {editing ? '更新' : '追加'} <span className="kbd">Enter</span>
          </button>
        </div>
        <div className="shortcut-help" style={{ marginTop: 8 }}>
          金額・メモ欄で <kbd>Enter</kbd> で保存。区分を変えると費目の候補が切り替わります。
        </div>
      </div>
    </div>
  );
}
