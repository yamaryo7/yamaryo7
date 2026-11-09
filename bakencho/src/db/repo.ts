// 永続化の窓口。Tauri上では SQLite（tauri-plugin-sql）、ブラウザで開いた場合は確認用に localStorage を使う。
import type { Category, HouseholdEntry, ImportMapping, Race, Snapshot, Ticket } from '../domain/types';

export interface Repo {
  readonly kind: 'sqlite' | 'browser';
  /** 保存先の説明（設定画面に表示） */
  location(): Promise<string>;
  load(): Promise<Snapshot>;
  insertRace(r: Race): Promise<void>;
  updateRace(r: Race): Promise<void>;
  /** レースと、その票をまとめて削除 */
  deleteRace(id: string): Promise<void>;
  insertTickets(ts: Ticket[]): Promise<void>;
  updateTicket(t: Ticket): Promise<void>;
  deleteTicket(id: string): Promise<void>;
  insertHousehold(h: HouseholdEntry): Promise<void>;
  updateHousehold(h: HouseholdEntry): Promise<void>;
  deleteHousehold(id: string): Promise<void>;
  /** 費目は件数が少ないので丸ごと置き換える */
  replaceCategories(cs: Category[]): Promise<void>;
  saveMapping(m: ImportMapping): Promise<void>;
  deleteMapping(id: string): Promise<void>;
  /** 復元・全削除用。全テーブルを置き換える */
  replaceAll(s: Snapshot): Promise<void>;
  /** 取り込み用。レースと票をまとめて追加 */
  bulkInsert(races: Race[], tickets: Ticket[]): Promise<void>;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function openRepo(): Promise<Repo> {
  if (isTauri()) {
    const { SqliteRepo } = await import('./sqliteRepo');
    return SqliteRepo.open();
  }
  const { BrowserRepo } = await import('./browserRepo');
  return new BrowserRepo();
}
