// 3ペイン: 左サイドバー（200px／折りたたみ56px）、中央メイン、右入力パネル（340px）。
import { useEffect, useMemo, useState } from 'react';
import { PeriodBar } from './components/PeriodBar';
import { ConfirmHost, Toasts } from './components/ui';
import { monthOf } from './domain/date';
import { signClass, signedYen, pct } from './domain/format';
import { kpi } from './domain/metrics';
import { periodRange } from './domain/period';
import { Analysis } from './pages/Analysis';
import { Dashboard } from './pages/Dashboard';
import { Household } from './pages/Household';
import { Races } from './pages/Races';
import { Settings } from './pages/Settings';
import { HouseholdInputPanel } from './panels/HouseholdInputPanel';
import { TicketInputPanel } from './panels/TicketInputPanel';
import { useStore, type Page } from './state/store';

const NAV: Array<{ page: Page; label: string; icon: JSX.Element }> = [
  { page: 'dashboard', label: 'ダッシュボード', icon: <path d="M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z" /> },
  { page: 'races', label: 'レース明細', icon: <path d="M3 4h14M3 8h14M3 12h14M3 16h9" /> },
  { page: 'household', label: '家計簿', icon: <path d="M4 3h12v14H4zM7 7h6M7 10h6M7 13h3" /> },
  { page: 'analysis', label: '分析', icon: <path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7" /> },
  { page: 'settings', label: '設定・データ', icon: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></> },
];

const TITLES: Record<Page, string> = {
  dashboard: 'ダッシュボード',
  races: 'レース明細',
  household: '家計簿',
  analysis: '分析',
  settings: '設定・データ',
};

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('bakencho-theme') as Theme) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('bakencho-theme', theme); } catch { /* 無視 */ }
  }, [theme]);
  const cycle = () => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));
  return [theme, cycle];
}

export function App() {
  const { ready, loadError, page, setPage, data, today } = useStore();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('bakencho-collapsed') === '1'; } catch { return false; }
  });
  const [theme, cycleTheme] = useTheme();

  useEffect(() => {
    try { localStorage.setItem('bakencho-collapsed', collapsed ? '1' : '0'); } catch { /* 無視 */ }
  }, [collapsed]);

  // Ctrl/Cmd + 1〜5 で画面切替
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setPage(NAV[Number(e.key) - 1].page);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPage]);

  // サイドバー下部: 今月の収支（期間切替に関係なく常に今月）
  const month = useMemo(() => kpi(data.races, data.tickets, periodRange({ kind: 'thisMonth' }, today)).agg, [data.races, data.tickets, today]);

  if (loadError) return <div className="loading">データベースを開けませんでした: {loadError}</div>;
  if (!ready) return <div className="loading">読み込み中…</div>;

  const showPeriod = page !== 'settings';
  const isMac = navigator.platform.includes('Mac');

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect x="64" y="64" width="896" height="896" rx="200" fill="var(--turf)" />
            <path d="M312 300 L312 560 A200 200 0 0 0 712 560 L712 300" fill="none" stroke="var(--surface)" strokeWidth="120" strokeLinecap="round" />
          </svg>
          <span className="brand-name">馬券帳</span>
        </div>
        <nav className="nav" aria-label="画面">
          {NAV.map((n, i) => (
            <button key={n.page} aria-current={page === n.page ? 'page' : undefined} onClick={() => setPage(n.page)} title={`${n.label}（${isMac ? '⌘' : 'Ctrl'}+${i + 1}）`}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{n.icon}</svg>
              <span className="txt">{n.label}</span>
              <span className="kbd">{isMac ? '⌘' : '^'}{i + 1}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot" title="今月の競馬収支（期間切替に関係なく常に今月）">
          <div className="label">今月の収支</div>
          <div className={`value ${signClass(month.balance)}`}>{signedYen(month.balance)}</div>
          <div className="sub">回収率 {pct(month.returnRate)}　{month.tickets}票</div>
          <div className="sub faint">{monthOf(today).replace('-', '年')}月</div>
        </div>
        <div className="side-tools">
          <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'サイドバーを広げる' : 'サイドバーを折りたたむ'} title={collapsed ? '広げる' : '折りたたむ'}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M6 2.5v11" /></svg>
          </button>
          <button className="icon-btn" onClick={cycleTheme} aria-label="表示テーマを切り替え" title={`テーマ: ${theme === 'system' ? 'OSに合わせる' : theme === 'light' ? 'ライト' : 'ダーク'}`}>
            {theme === 'dark' ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" /></svg>
            ) : theme === 'light' ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" /></svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>
            )}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="main-head">
          <h1>{TITLES[page]}</h1>
          {showPeriod && <PeriodBar />}
        </div>
        <div className="main-body">
          {page === 'dashboard' && <Dashboard />}
          {page === 'races' && <Races />}
          {page === 'household' && <Household />}
          {page === 'analysis' && <Analysis />}
          {page === 'settings' && <Settings />}
        </div>
      </main>

      {page === 'household' ? <HouseholdInputPanel /> : <TicketInputPanel />}
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
