// 日付欄（YYYY-MM-DD）。土日を強調したカレンダーを開ける。
// キーボード: ↑↓で1日前後、PageUp/PageDownで1週間、Alt+↓でカレンダー、tで今日。
import { forwardRef, useEffect, useRef, useState } from 'react';
import { addDays, addMonths, daysInMonth, isValidDate, makeDate, monthOf, weekday, weekdayJa, formatMonthJa } from '../domain/date';

interface Props {
  value: string;
  onChange: (v: string) => void;
  today: string;
  /** 票のある日に下線を付ける */
  marked?: ReadonlySet<string>;
  id?: string;
  'aria-label'?: string;
}

export const DateField = forwardRef<HTMLInputElement, Props>(function DateField({ value, onChange, today, marked, id, ...rest }, ref) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(monthOf(value || today));
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (!open) return;
    setView(monthOf(isValidDate(value) ? value : today));
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, value, today]);

  const commitText = (t: string) => {
    const s = t.trim().replace(/[/.]/g, '-');
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    const md = /^(\d{1,2})-(\d{1,2})$/.exec(s); // 年を省略したら今年
    let d: string | null = null;
    if (m) d = makeDate(+m[1], +m[2], +m[3]);
    else if (md) d = makeDate(+today.slice(0, 4), +md[1], +md[2]);
    if (d && isValidDate(d)) {
      onChange(d);
      setText(d);
    } else setText(value);
  };

  const shift = (n: number) => {
    const base = isValidDate(value) ? value : today;
    onChange(addDays(base, n));
  };

  const w = isValidDate(value) ? weekday(value) : -1;
  const y = +view.slice(0, 4), mo = +view.slice(5, 7);
  const first = weekday(`${view}-01`);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(`${view}-01`, i - first));
  const weeks = Array.from({ length: cells[35] > makeDate(y, mo, daysInMonth(y, mo)) ? 5 : 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div className="datefield" ref={wrap}>
      <div className="inner">
        <input
          ref={ref}
          id={id}
          aria-label={rest['aria-label']}
          value={text}
          inputMode="numeric"
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              if (e.altKey && e.key === 'ArrowDown') { setOpen(true); e.preventDefault(); return; }
              e.preventDefault();
              shift(e.key === 'ArrowUp' ? 1 : -1);
            } else if (e.key === 'PageUp' || e.key === 'PageDown') {
              e.preventDefault();
              shift(e.key === 'PageUp' ? 7 : -7);
            } else if (e.key === 't' || e.key === 'T') {
              e.preventDefault();
              onChange(today);
            } else if (e.key === 'Enter') {
              commitText((e.target as HTMLInputElement).value);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {w >= 0 && <span className={`wd ${w === 6 ? 'sat' : w === 0 ? 'sun' : 'muted'}`}>({weekdayJa(value)})</span>}
        <button type="button" className="cal-btn" tabIndex={-1} aria-label="カレンダーを開く" onClick={() => setOpen((o) => !o)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
        </button>
      </div>
      {open && (
        <div className="cal" role="dialog" aria-label="カレンダー">
          <div className="cal-head">
            <button type="button" className="btn ghost sm" onClick={() => setView(addMonths(view, -1))} aria-label="前の月">‹</button>
            <span>{formatMonthJa(view)}</span>
            <button type="button" className="btn ghost sm" onClick={() => setView(addMonths(view, 1))} aria-label="次の月">›</button>
          </div>
          <table>
            <thead>
              <tr>{['日', '月', '火', '水', '木', '金', '土'].map((d, i) => <th key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((wk, i) => (
                <tr key={i}>
                  {wk.map((d) => {
                    const wd = weekday(d);
                    const cls = [wd === 6 ? 'sat' : wd === 0 ? 'sun' : '', monthOf(d) !== view ? 'other' : '', d === today ? 'today' : '', d === value ? 'sel' : '', marked?.has(d) ? 'has' : ''].join(' ');
                    return (
                      <td key={d} className={cls}>
                        <button type="button" onClick={() => { onChange(d); setOpen(false); }}>{+d.slice(8)}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cal-foot">
            <button type="button" className="btn sm" onClick={() => { onChange(today); setOpen(false); }}>今日</button>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                // 直近の土曜（今日が日曜なら昨日）
                let d = today;
                while (weekday(d) !== 6) d = addDays(d, -1);
                onChange(d);
                setOpen(false);
              }}
            >
              直近の土曜
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
