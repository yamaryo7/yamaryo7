// SQLite（tauri-plugin-sql）への保存。スキーマは src-tauri/migrations で起動時に作られる。
import Database from '@tauri-apps/plugin-sql';
import { appConfigDir, join } from '@tauri-apps/api/path';
import type { Category, HouseholdEntry, ImportMapping, Race, Snapshot, Ticket } from '../domain/types';
import type { Repo } from './repo';

export const DB_FILE = 'bakencho.db';
const DB_URL = `sqlite:${DB_FILE}`;

const RACE_COLS = ['id', 'date', 'course', 'race_no', 'name', 'note'] as const;
const TICKET_COLS = ['id', 'race_id', 'bet_type', 'method', 'selection', 'unit_price', 'points', 'stake', 'payout', 'created_at'] as const;
const HH_COLS = ['id', 'date', 'kind', 'category', 'memo', 'amount'] as const;
const CAT_COLS = ['id', 'name', 'kind', 'sort_order'] as const;
const MAP_COLS = ['id', 'name', 'mapping_json', 'created_at'] as const;

type Row = Record<string, unknown>;

export class SqliteRepo implements Repo {
  readonly kind = 'sqlite' as const;
  /** 書き込みを1本の列に並べ、払戻の連続入力などで順序が入れ替わらないようにする */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private db: Database) {}

  static async open(): Promise<SqliteRepo> {
    const db = await Database.load(DB_URL);
    return new SqliteRepo(db);
  }

  private write<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private exec(sql: string, binds: unknown[] = []) {
    return this.write(() => this.db.execute(sql, binds));
  }

  /** 複数行を1文のINSERTにまとめる（1文なのでSQLite上は原子的） */
  private insertMany<T extends Row>(table: string, cols: readonly string[], rows: T[]) {
    const CHUNK = Math.max(1, Math.floor(900 / cols.length));
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const binds: unknown[] = [];
      const values = part
        .map((r) => '(' + cols.map((c) => { binds.push(r[c] ?? null); return `$${binds.length}`; }).join(',') + ')')
        .join(',');
      jobs.push(this.exec(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values}`, binds));
    }
    return Promise.all(jobs).then(() => undefined);
  }

  private update<T extends Row>(table: string, cols: readonly string[], row: T) {
    const set = cols.slice(1).map((c, i) => `${c} = $${i + 2}`).join(', ');
    return this.exec(`UPDATE ${table} SET ${set} WHERE id = $1`, cols.map((c) => row[c] ?? null)).then(() => undefined);
  }

  async location() {
    return await join(await appConfigDir(), DB_FILE);
  }

  async load(): Promise<Snapshot> {
    await this.queue;
    const [races, tickets, household, categories, mappings] = await Promise.all([
      this.db.select<Race[]>(`SELECT ${RACE_COLS.join(',')} FROM race`),
      this.db.select<Ticket[]>(`SELECT ${TICKET_COLS.join(',')} FROM ticket`),
      this.db.select<HouseholdEntry[]>(`SELECT ${HH_COLS.join(',')} FROM household_entry`),
      this.db.select<Category[]>(`SELECT ${CAT_COLS.join(',')} FROM category ORDER BY sort_order`),
      this.db.select<ImportMapping[]>(`SELECT ${MAP_COLS.join(',')} FROM import_mapping ORDER BY created_at`),
    ]);
    return { races, tickets, household, categories, mappings };
  }

  insertRace(r: Race) {
    return this.insertMany('race', RACE_COLS, [r as unknown as Row]);
  }
  updateRace(r: Race) {
    return this.update('race', RACE_COLS, r as unknown as Row);
  }
  async deleteRace(id: string) {
    // 外部キーのON DELETE CASCADEは接続ごとの設定に依存するため、票を明示的に先に消す
    await this.exec('DELETE FROM ticket WHERE race_id = $1', [id]);
    await this.exec('DELETE FROM race WHERE id = $1', [id]);
  }
  insertTickets(ts: Ticket[]) {
    return this.insertMany('ticket', TICKET_COLS, ts as unknown as Row[]);
  }
  updateTicket(t: Ticket) {
    return this.update('ticket', TICKET_COLS, t as unknown as Row);
  }
  async deleteTicket(id: string) {
    await this.exec('DELETE FROM ticket WHERE id = $1', [id]);
  }
  insertHousehold(h: HouseholdEntry) {
    return this.insertMany('household_entry', HH_COLS, [h as unknown as Row]);
  }
  updateHousehold(h: HouseholdEntry) {
    return this.update('household_entry', HH_COLS, h as unknown as Row);
  }
  async deleteHousehold(id: string) {
    await this.exec('DELETE FROM household_entry WHERE id = $1', [id]);
  }
  async replaceCategories(cs: Category[]) {
    await this.exec('DELETE FROM category');
    await this.insertMany('category', CAT_COLS, cs as unknown as Row[]);
  }
  async saveMapping(m: ImportMapping) {
    await this.exec('DELETE FROM import_mapping WHERE id = $1', [m.id]);
    await this.insertMany('import_mapping', MAP_COLS, [m as unknown as Row]);
  }
  async deleteMapping(id: string) {
    await this.exec('DELETE FROM import_mapping WHERE id = $1', [id]);
  }
  async replaceAll(s: Snapshot) {
    for (const t of ['ticket', 'race', 'household_entry', 'category', 'import_mapping']) await this.exec(`DELETE FROM ${t}`);
    await this.insertMany('race', RACE_COLS, s.races as unknown as Row[]);
    await this.insertMany('ticket', TICKET_COLS, s.tickets as unknown as Row[]);
    await this.insertMany('household_entry', HH_COLS, s.household as unknown as Row[]);
    await this.insertMany('category', CAT_COLS, s.categories as unknown as Row[]);
    await this.insertMany('import_mapping', MAP_COLS, s.mappings as unknown as Row[]);
  }
  async bulkInsert(races: Race[], tickets: Ticket[]) {
    await this.insertMany('race', RACE_COLS, races as unknown as Row[]);
    await this.insertMany('ticket', TICKET_COLS, tickets as unknown as Row[]);
  }
}
