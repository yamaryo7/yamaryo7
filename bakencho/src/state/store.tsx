// アプリ全体の状態。データはすべてメモリ上に持ち、集計は描画時に純粋関数で行う（即時反映のため）。
// 変更は先に画面へ反映し、続けて保存する。保存に失敗したら読み込み直して元に戻す。
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openRepo, type Repo } from '../db/repo';
import { todayLocal } from '../domain/date';
import { periodRange, type DateRange, type Period } from '../domain/period';
import { buildSample } from '../domain/sample';
import { makeTicket, newId, type TicketDraft } from '../domain/ticket';
import {
  EMPTY_SNAPSHOT, type Category, type HouseholdEntry, type ImportMapping, type Race, type Snapshot, type Ticket,
} from '../domain/types';

export type Page = 'dashboard' | 'races' | 'household' | 'analysis' | 'settings';

export interface RaceFields {
  date: string;
  course: string;
  race_no: number;
  name: string;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface Store {
  ready: boolean;
  loadError: string | null;
  repo: Repo | null;
  data: Snapshot;
  today: string;
  page: Page;
  setPage(p: Page): void;
  period: Period;
  setPeriod(p: Period): void;
  range: DateRange | null;
  /** 入力パネルに読み込むレース（「このレースに票を追加」） */
  prefill: RaceFields | null;
  setPrefill(r: RaceFields | null): void;

  saveRace(fields: RaceFields, drafts: TicketDraft[]): Promise<{ race: Race; added: number; existed: boolean }>;
  updateRace(r: Race): Promise<void>;
  deleteRace(id: string): Promise<void>;
  setPayout(ticketId: string, payout: number | null): Promise<void>;
  deleteTicket(id: string): Promise<void>;
  addHousehold(h: Omit<HouseholdEntry, 'id'>): Promise<void>;
  updateHousehold(h: HouseholdEntry): Promise<void>;
  deleteHousehold(id: string): Promise<void>;
  setCategories(cs: Category[]): Promise<void>;
  saveMapping(m: ImportMapping): Promise<void>;
  deleteMapping(id: string): Promise<void>;
  replaceAll(s: Snapshot): Promise<void>;
  bulkInsert(races: Race[], tickets: Ticket[]): Promise<void>;
  loadSample(): Promise<void>;

  toasts: ToastItem[];
  toast(message: string, kind?: ToastItem['kind']): void;
  confirmReq: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  confirm(req: ConfirmRequest): Promise<boolean>;
  closeConfirm(ok: boolean): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [data, setData] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState(todayLocal());
  const [page, setPage] = useState<Page>('dashboard');
  const [period, setPeriod] = useState<Period>({ kind: 'thisMonth' });
  const [prefill, setPrefill] = useState<RaceFields | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmReq, setConfirmReq] = useState<Store['confirmReq']>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const toastSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await openRepo();
        const s = await r.load();
        if (!alive) return;
        setRepo(r);
        setData(s);
        setReady(true);
      } catch (e) {
        setLoadError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 日付が変わったら「今日」「今月」を更新する（開きっぱなし対策）
  useEffect(() => {
    const t = setInterval(() => setToday(todayLocal()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2400);
  }, []);

  const confirm = useCallback((req: ConfirmRequest) => new Promise<boolean>((resolve) => setConfirmReq({ ...req, resolve })), []);
  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmReq((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  /** 画面を先に更新し、保存する。失敗したら保存済みの状態に戻す。 */
  const commit = useCallback(
    async (next: (s: Snapshot) => Snapshot, persist: (r: Repo) => Promise<void>) => {
      if (!repo) return;
      setData((s) => next(s));
      try {
        await persist(repo);
      } catch (e) {
        toast(`保存に失敗しました: ${String(e)}`, 'error');
        setData(await repo.load());
        throw e;
      }
    },
    [repo, toast],
  );

  const store = useMemo<Store>(() => {
    const findRace = (f: RaceFields) =>
      dataRef.current.races.find((r) => r.date === f.date && r.course === f.course && r.race_no === f.race_no);

    return {
      ready, loadError, repo, data, today, page, setPage, period, setPeriod, prefill, setPrefill,
      range: periodRange(period, today),
      toasts, toast, confirmReq, confirm, closeConfirm,

      async saveRace(fields, drafts) {
        const existing = findRace(fields);
        const race: Race = existing
          ? { ...existing, name: fields.name.trim() || existing.name }
          : { id: newId(), date: fields.date, course: fields.course.trim(), race_no: fields.race_no, name: fields.name.trim() || null, note: null };
        const base = nowIso().replace(/(\.\d+)?Z$/, '');
        const tickets = drafts.map((d, i) => makeTicket(race.id, d, `${base}.${String(i).padStart(6, '0')}Z`));
        await commit(
          (s) => ({
            ...s,
            races: existing ? s.races.map((r) => (r.id === race.id ? race : r)) : [...s.races, race],
            tickets: [...s.tickets, ...tickets],
          }),
          async (r) => {
            if (existing) {
              if (race.name !== existing.name) await r.updateRace(race);
            } else await r.insertRace(race);
            await r.insertTickets(tickets);
          },
        );
        return { race, added: tickets.length, existed: !!existing };
      },

      updateRace: (race) => commit((s) => ({ ...s, races: s.races.map((r) => (r.id === race.id ? race : r)) }), (r) => r.updateRace(race)),

      deleteRace: (id) =>
        commit((s) => ({ ...s, races: s.races.filter((r) => r.id !== id), tickets: s.tickets.filter((t) => t.race_id !== id) }), (r) => r.deleteRace(id)),

      async setPayout(ticketId, payout) {
        const t = dataRef.current.tickets.find((x) => x.id === ticketId);
        if (!t || t.payout === payout) return;
        const next = { ...t, payout };
        await commit((s) => ({ ...s, tickets: s.tickets.map((x) => (x.id === ticketId ? next : x)) }), (r) => r.updateTicket(next));
      },

      deleteTicket: (id) => commit((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== id) }), (r) => r.deleteTicket(id)),

      async addHousehold(h) {
        const entry: HouseholdEntry = { ...h, id: newId() };
        await commit((s) => ({ ...s, household: [...s.household, entry] }), (r) => r.insertHousehold(entry));
      },
      updateHousehold: (h) => commit((s) => ({ ...s, household: s.household.map((x) => (x.id === h.id ? h : x)) }), (r) => r.updateHousehold(h)),
      deleteHousehold: (id) => commit((s) => ({ ...s, household: s.household.filter((x) => x.id !== id) }), (r) => r.deleteHousehold(id)),
      setCategories: (cs) => commit((s) => ({ ...s, categories: cs }), (r) => r.replaceCategories(cs)),
      saveMapping: (m) => commit((s) => ({ ...s, mappings: [...s.mappings.filter((x) => x.id !== m.id), m] }), (r) => r.saveMapping(m)),
      deleteMapping: (id) => commit((s) => ({ ...s, mappings: s.mappings.filter((x) => x.id !== id) }), (r) => r.deleteMapping(id)),
      replaceAll: (snap) => commit(() => snap, (r) => r.replaceAll(snap)),
      bulkInsert: (races, tickets) =>
        commit((s) => ({ ...s, races: [...s.races, ...races], tickets: [...s.tickets, ...tickets] }), (r) => r.bulkInsert(races, tickets)),

      async loadSample() {
        const sample = buildSample(today, nowIso());
        // 費目と取り込み設定は今のものを残す
        const snap = { ...sample, categories: dataRef.current.categories.length ? dataRef.current.categories : sample.categories, mappings: dataRef.current.mappings };
        await commit(() => snap, (r) => r.replaceAll(snap));
      },
    };
  }, [ready, loadError, repo, data, today, page, period, prefill, toasts, toast, confirmReq, confirm, closeConfirm, commit]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
