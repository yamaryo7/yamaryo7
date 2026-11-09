// ブラウザで `npm run dev` したとき用の保存先（画面確認用）。本番の保存先は SQLite。
import { defaultCategories } from '../domain/backup';
import { EMPTY_SNAPSHOT, type Snapshot } from '../domain/types';
import type { Repo } from './repo';

const KEY = 'bakencho-dev-v1';

export class BrowserRepo implements Repo {
  readonly kind = 'browser' as const;
  private s: Snapshot;

  constructor() {
    let s: Snapshot | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) s = JSON.parse(raw) as Snapshot;
    } catch {
      s = null;
    }
    this.s = s ?? { ...EMPTY_SNAPSHOT, categories: defaultCategories() };
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // 保存できなくても画面は動かす（確認用のため）
    }
  }

  private mut(fn: (s: Snapshot) => Snapshot) {
    this.s = fn(this.s);
    this.persist();
    return Promise.resolve();
  }

  async location() {
    return 'ブラウザの localStorage（確認用。デスクトップ版では SQLite に保存されます）';
  }
  async load() {
    return structuredClone(this.s);
  }
  insertRace(r: Snapshot['races'][number]) {
    return this.mut((s) => ({ ...s, races: [...s.races, r] }));
  }
  updateRace(r: Snapshot['races'][number]) {
    return this.mut((s) => ({ ...s, races: s.races.map((x) => (x.id === r.id ? r : x)) }));
  }
  deleteRace(id: string) {
    return this.mut((s) => ({ ...s, races: s.races.filter((x) => x.id !== id), tickets: s.tickets.filter((t) => t.race_id !== id) }));
  }
  insertTickets(ts: Snapshot['tickets']) {
    return this.mut((s) => ({ ...s, tickets: [...s.tickets, ...ts] }));
  }
  updateTicket(t: Snapshot['tickets'][number]) {
    return this.mut((s) => ({ ...s, tickets: s.tickets.map((x) => (x.id === t.id ? t : x)) }));
  }
  deleteTicket(id: string) {
    return this.mut((s) => ({ ...s, tickets: s.tickets.filter((x) => x.id !== id) }));
  }
  insertHousehold(h: Snapshot['household'][number]) {
    return this.mut((s) => ({ ...s, household: [...s.household, h] }));
  }
  updateHousehold(h: Snapshot['household'][number]) {
    return this.mut((s) => ({ ...s, household: s.household.map((x) => (x.id === h.id ? h : x)) }));
  }
  deleteHousehold(id: string) {
    return this.mut((s) => ({ ...s, household: s.household.filter((x) => x.id !== id) }));
  }
  replaceCategories(cs: Snapshot['categories']) {
    return this.mut((s) => ({ ...s, categories: cs }));
  }
  saveMapping(m: Snapshot['mappings'][number]) {
    return this.mut((s) => ({ ...s, mappings: [...s.mappings.filter((x) => x.id !== m.id), m] }));
  }
  deleteMapping(id: string) {
    return this.mut((s) => ({ ...s, mappings: s.mappings.filter((x) => x.id !== id) }));
  }
  replaceAll(next: Snapshot) {
    return this.mut(() => structuredClone(next));
  }
  bulkInsert(races: Snapshot['races'], tickets: Snapshot['tickets']) {
    return this.mut((s) => ({ ...s, races: [...s.races, ...races], tickets: [...s.tickets, ...tickets] }));
  }
}
