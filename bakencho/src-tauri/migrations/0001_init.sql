-- 馬券帳 初期スキーマ
-- 金額はすべて INTEGER（円）。日付はローカル日付の TEXT（YYYY-MM-DD）。

CREATE TABLE IF NOT EXISTS race (
  id       TEXT PRIMARY KEY,
  date     TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  course   TEXT NOT NULL,
  race_no  INTEGER NOT NULL CHECK (race_no BETWEEN 1 AND 99),
  name     TEXT,
  note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_race_date ON race(date);
CREATE INDEX IF NOT EXISTS idx_race_key ON race(date, course, race_no);

CREATE TABLE IF NOT EXISTS ticket (
  id          TEXT PRIMARY KEY,
  race_id     TEXT NOT NULL REFERENCES race(id) ON DELETE CASCADE,
  bet_type    TEXT NOT NULL CHECK (bet_type IN ('単勝','複勝','枠連','馬連','馬単','ワイド','三連複','三連単','WIN5','その他')),
  method      TEXT NOT NULL CHECK (method IN ('通常','流し','ボックス','フォーメーション')),
  selection   TEXT NOT NULL DEFAULT '',
  unit_price  INTEGER NOT NULL CHECK (unit_price > 0),
  points      INTEGER NOT NULL CHECK (points > 0),
  stake       INTEGER NOT NULL,
  payout      INTEGER CHECK (payout IS NULL OR payout >= 0), -- NULL=未確定, 0=不的中
  created_at  TEXT NOT NULL,
  CHECK (stake = unit_price * points)
);
CREATE INDEX IF NOT EXISTS idx_ticket_race ON ticket(race_id);

CREATE TABLE IF NOT EXISTS category (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (name <> '競馬'),
  kind        TEXT NOT NULL CHECK (kind IN ('expense','income')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name, kind)
);

-- 家計簿の手入力行。競馬の行は保存しない（票から導出する）
CREATE TABLE IF NOT EXISTS household_entry (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  kind      TEXT NOT NULL CHECK (kind IN ('expense','income')),
  category  TEXT NOT NULL CHECK (category <> '競馬'),
  memo      TEXT NOT NULL DEFAULT '',
  amount    INTEGER NOT NULL CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_household_date ON household_entry(date);

-- Excel取り込みの列マッピング（再利用）
CREATE TABLE IF NOT EXISTS import_mapping (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  mapping_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO category (id, name, kind, sort_order) VALUES
  ('cat-01', '食費',   'expense', 0),
  ('cat-02', '外食',   'expense', 1),
  ('cat-03', '日用品', 'expense', 2),
  ('cat-04', '住居',   'expense', 3),
  ('cat-05', '光熱費', 'expense', 4),
  ('cat-06', '通信',   'expense', 5),
  ('cat-07', '交通',   'expense', 6),
  ('cat-08', '娯楽',   'expense', 7),
  ('cat-09', '医療',   'expense', 8),
  ('cat-10', 'その他', 'expense', 9),
  ('cat-11', '給与',   'income', 10),
  ('cat-12', 'その他', 'income', 11);
