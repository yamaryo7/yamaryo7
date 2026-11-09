// 小さな共通部品: 金額セル、結果バッジ、KPIタイル、モーダル、トースト、確認ダイアログ
import { ReactNode, useEffect, useRef } from 'react';
import { pct, signClass, signedYen, yen } from '../domain/format';
import type { RaceResult, TicketResult } from '../domain/metrics';
import { useStore } from '../state/store';

export function Yen({ v, signed = false }: { v: number; signed?: boolean }) {
  return <span className={signed ? signClass(v) : undefined}>{signed ? signedYen(v) : yen(v)}</span>;
}

export function Pct({ r, colorize = false }: { r: number | null; colorize?: boolean }) {
  const cls = colorize && r !== null ? (r >= 1 ? 'pos' : 'neg') : undefined;
  return <span className={cls}>{pct(r)}</span>;
}

const RESULT_LABEL: Record<RaceResult, string> = { hit: '的中', miss: '不的中', pending: '未確定', empty: '票なし' };

export function ResultBadge({ result }: { result: RaceResult | TicketResult }) {
  return <span className={`badge ${result === 'empty' ? 'miss' : result}`}>{RESULT_LABEL[result]}</span>;
}

export function Kpi({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${className ?? ''}`}>{value}</div>
      {sub !== undefined && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Modal({
  title, children, footer, onClose, wide = false,
}: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, button.primary, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmHost() {
  const { confirmReq, closeConfirm } = useStore();
  if (!confirmReq) return null;
  return (
    <Modal
      title={confirmReq.title}
      onClose={() => closeConfirm(false)}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={() => closeConfirm(false)}>キャンセル</button>
          <button className={`btn ${confirmReq.danger ? 'danger solid' : 'primary'}`} data-autofocus onClick={() => closeConfirm(true)}>
            {confirmReq.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      <div>{confirmReq.message}</div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.message}</div>
      ))}
    </div>
  );
}

export function Card({ title, actions, children, bodyClass = 'card-body' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; bodyClass?: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
