// SqliteRepo を、本物のマイグレーションSQLと Node 内蔵の SQLite（node:sqlite）で検証する。
// tauri-plugin-sql の Database は同じ形（load/select/execute、$1 形式の引数）の代用品に差し替える。
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSample } from '../domain/sample';
import { race, ticket } from '../domain/testkit';

let db: DatabaseSync;

const toNamed = (binds: unknown[] = []) => Object.fromEntries(binds.map((v, i) => [`$${i + 1}`, v === undefined ? null : (v as never)]));
const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as object) }));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => ({
      select: async (sql: string, binds?: unknown[]) => plain(db.prepare(sql).all(toNamed(binds))),
      execute: async (sql: string, binds?: unknown[]) => {
        const r = db.prepare(sql).run(toNamed(binds));
        return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
      },
    }),
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ appConfigDir: async () => '/cfg', join: async (...p: string[]) => p.join('/') }));

const { SqliteRepo } = await import('./sqliteRepo');

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../src-tauri/migrations/0001_init.sql', import.meta.url), 'utf8'));
});

const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));

describe('SqliteRepo（マイグレーション＋保存処理）', () => {
  it('初期費目が入っている', async () => {
    const repo = await SqliteRepo.open();
    const s = await repo.load();
    expect(s.categories.map((c) => c.name)).toEqual(['食費', '外食', '日用品', '住居', '光熱費', '通信', '交通', '娯楽', '医療', 'その他', '給与', 'その他']);
    expect(await repo.location()).toBe('/cfg/bakencho.db');
  });

  it('レースと票の保存・払戻の更新・削除', async () => {
    const repo = await SqliteRepo.open();
    const r = race('2026-11-01', '中山', 11, null, 'race-a');
    const ts = [ticket(r, '馬連', '3-7', 600, 0), ticket(r, 'ワイド', '1,3,7', 300, null, { method: 'ボックス', unit: 100, points: 3 })];
    await repo.insertRace(r);
    await repo.insertTickets(ts);
    let s = await repo.load();
    expect(s.races).toEqual([r]);
    expect(byId(s.tickets)).toEqual(byId(ts));
    expect(s.tickets.find((t) => t.method === 'ボックス')!.payout).toBeNull();

    await repo.updateTicket({ ...ts[1], payout: 450 });
    s = await repo.load();
    expect(s.tickets.find((t) => t.id === ts[1].id)!.payout).toBe(450);

    await repo.deleteRace(r.id);
    s = await repo.load();
    expect(s.races).toEqual([]);
    expect(s.tickets).toEqual([]);
  });

  it('購入額が 1点金額×点数 と合わない票はDBが拒否する', async () => {
    const repo = await SqliteRepo.open();
    const r = race('2026-11-01', '中山', 11, null, 'race-b');
    await repo.insertRace(r);
    await expect(repo.insertTickets([{ ...ticket(r, '単勝', '1', 100, 0), stake: 999 }])).rejects.toThrow(/CHECK/);
  });

  it('「競馬」の費目・家計行はDBが拒否する', async () => {
    const repo = await SqliteRepo.open();
    await expect(repo.insertHousehold({ id: 'h', date: '2026-11-01', kind: 'expense', category: '競馬', memo: '', amount: 100 })).rejects.toThrow(/CHECK/);
  });

  it('サンプル一式を丸ごと置き換え・読み戻しできる（分割INSERT）', async () => {
    const repo = await SqliteRepo.open();
    const snap = buildSample('2026-11-09', '2026-11-09T00:00:00.000Z');
    expect(snap.tickets.length).toBeGreaterThan(200);
    await repo.replaceAll(snap);
    const s = await repo.load();
    expect(byId(s.races)).toEqual(byId(snap.races));
    expect(byId(s.tickets)).toEqual(byId(snap.tickets));
    expect(byId(s.household)).toEqual(byId(snap.household));
    expect(s.categories.length).toBe(snap.categories.length);
  });

  it('家計簿・費目・マッピングの更新', async () => {
    const repo = await SqliteRepo.open();
    await repo.insertHousehold({ id: 'h1', date: '2026-11-03', kind: 'expense', category: '食費', memo: 'スーパー', amount: 6200 });
    await repo.updateHousehold({ id: 'h1', date: '2026-11-03', kind: 'expense', category: '外食', memo: '', amount: 1200 });
    await repo.replaceCategories([{ id: 'c1', name: '食費', kind: 'expense', sort_order: 0 }]);
    await repo.saveMapping({ id: 'm1', name: '知人の表', mapping_json: '{}', created_at: '2026-11-09T00:00:00Z' });
    await repo.saveMapping({ id: 'm1', name: '知人の表(改)', mapping_json: '{}', created_at: '2026-11-09T00:00:00Z' });
    const s = await repo.load();
    expect(s.household).toEqual([{ id: 'h1', date: '2026-11-03', kind: 'expense', category: '外食', memo: '', amount: 1200 }]);
    expect(s.categories).toHaveLength(1);
    expect(s.mappings.map((m) => m.name)).toEqual(['知人の表(改)']);
    await repo.deleteHousehold('h1');
    await repo.deleteMapping('m1');
    expect((await repo.load()).household).toEqual([]);
  });
});
