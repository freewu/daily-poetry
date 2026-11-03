// 内存 SQLite：把 expo-sqlite 在设备上的 API（getFirstAsync / getAllAsync /
// runAsync / execAsync）映射到 Node 22.5+ 自带的 node:sqlite。
//
// 好处是 SQL 全部真跑一遍（含 LIKE 检索、ORDER BY、ON CONFLICT），
// 每日轮换 / 应景命中 / 收藏这些逻辑才算是被真正验证过。
import { DatabaseSync } from 'node:sqlite';

import type { Poem } from '@/lib/types';

/** 与 scripts/build-db.mjs 产出的库结构保持一致 */
const SCHEMA = `
  CREATE TABLE poems (
    id         INTEGER PRIMARY KEY,
    collection TEXT NOT NULL,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    dynasty    TEXT NOT NULL DEFAULT '',
    author     TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    subtitle   TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL,
    daily      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_poems_collection ON poems(collection);
  CREATE INDEX idx_poems_daily ON poems(daily, id);
  CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    daily INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE favorites (
    poem_id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE history (
    date TEXT PRIMARY KEY,
    poem_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type SqlParam = string | number | null;

/** expo-sqlite 里被项目用到的那部分接口 */
export interface TestDb {
  raw: DatabaseSync;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  execAsync(sql: string): Promise<void>;
  close(): void;
}

export function createTestDb(): TestDb {
  const raw = new DatabaseSync(':memory:');
  raw.exec(SCHEMA);

  const db: TestDb = {
    raw,
    async getFirstAsync<T>(sql: string, ...params: SqlParam[]) {
      const row = raw.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...params: SqlParam[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql: string, ...params: SqlParam[]) {
      const info = raw.prepare(sql).run(...params);
      return {
        changes: Number(info.changes ?? 0),
        lastInsertRowId: Number(info.lastInsertRowid ?? 0),
      };
    },
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
  return db;
}

/** 注入给组件里的 useSQLiteContext() */
export function setTestDb(db: TestDb | null): void {
  (globalThis as { __DB__?: TestDb | null }).__DB__ = db;
}

/** 建库 + 注入，返回可直接查询的句柄 */
export function useMemoryDb(): TestDb {
  const db = createTestDb();
  setTestDb(db);
  return db;
}

export interface SeedPoem extends Partial<Omit<Poem, 'id'>> {
  /** 便于用例里按 id 断言 */
  id?: number;
  title: string;
  content: string;
}

/** 按 id 顺序插入诗词，未给出的字段取合理默认值 */
export function seedPoems(db: TestDb, poems: SeedPoem[]): void {
  const stmt = db.raw.prepare(
    `INSERT INTO poems (id, collection, name, kind, dynasty, author, title, subtitle, content, daily)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  poems.forEach((p, i) => {
    stmt.run(
      p.id ?? i + 1,
      p.collection ?? 'tang',
      p.name ?? '唐诗三百首',
      p.kind ?? '五言绝句',
      p.dynasty ?? '唐',
      p.author ?? '李白',
      p.title,
      p.subtitle ?? '',
      p.content,
      p.daily ?? 1,
    );
  });
}

export function seedCollections(
  db: TestDb,
  cols: { id: string; name: string; kind?: string; count?: number; daily?: number }[],
): void {
  const stmt = db.raw.prepare(
    'INSERT INTO collections (id, name, kind, count, daily) VALUES (?,?,?,?,?)',
  );
  for (const c of cols) stmt.run(c.id, c.name, c.kind ?? '诗集', c.count ?? 0, c.daily ?? 1);
}

/** 项目的函数签名要求 expo-sqlite 的 SQLiteDatabase，内存实现结构一致 */
export function asDb(db: TestDb) {
  return db as unknown as import('expo-sqlite').SQLiteDatabase;
}

/** 以只读方式打开磁盘上的库（用于校验 assets/poetry.db 这份随包数据） */
export function openDbFile(file: string): TestDb {
  const raw = new DatabaseSync(file, { readOnly: true });
  return {
    raw,
    async getFirstAsync<T>(sql: string, ...params: SqlParam[]) {
      return (raw.prepare(sql).get(...params) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...params: SqlParam[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async runAsync() {
      throw new Error('只读库不支持写入');
    },
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}
