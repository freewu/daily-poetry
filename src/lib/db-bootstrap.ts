import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DB_NAME, DB_SCHEMA_VERSION } from './db';

/**
 * 随包数据库的换库逻辑。
 *
 * 语料从 1 千多首涨到 9 万首、且多了简繁两套列，装过旧版的设备上那份
 * poetry.db 必须整份换掉（结构变了，靠 SQL 迁移补不出 9 万首正文）。
 * expo-sqlite 的 assetSource 支持 forceOverwrite，但收藏 / 足迹在旧库里，
 * 所以启动时先看一眼旧库：版本不对就先把用户数据抄出来，等新库落盘后再
 * 按「题目 + 作者 + 首句」找回对应的 poem_id 写回去。
 */

export interface PoemKey {
  title: string;
  author: string;
  /** 正文首句前 12 字：题目可能重名，用首句定位到具体那一首 */
  head: string;
}

export interface RestorePlan {
  favorites: PoemKey[];
  history: { date: string; key: PoemKey }[];
  /** 换库会连 meta 一起换掉，用户偏好单独抄一份（白名单） */
  settings: Record<string, string>;
}

export interface DbPlan {
  /** 需要把随包数据库覆盖安装 */
  forceOverwrite: boolean;
  /** 换库前备份的用户数据（仅 forceOverwrite 时有） */
  restore: RestorePlan | null;
}

const KEY_COLUMNS = 'p.title, p.author, substr(p.content, 1, 12) AS head';

/** 换库时要保留的 meta 键（其余如 dataset / poem_count 属于库本身） */
export const KEPT_SETTINGS = [
  'settings_theme',
  'settings_push',
  'settings_script',
  'settings_font',
  'settings_font_size',
  'settings_layout',
  'settings_tts_rate',
] as const;

/** 抄出旧库里的收藏、足迹与偏好设置 */
export async function snapshotUserData(db: SQLiteDatabase): Promise<RestorePlan> {
  const favorites = await db.getAllAsync<PoemKey>(
    `SELECT ${KEY_COLUMNS} FROM favorites f JOIN poems p ON p.id = f.poem_id`,
  );
  const history = await db.getAllAsync<PoemKey & { date: string }>(
    `SELECT h.date AS date, ${KEY_COLUMNS}
       FROM history h JOIN poems p ON p.id = h.poem_id`,
  );
  const settings: Record<string, string> = {};
  try {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM meta WHERE key IN (${KEPT_SETTINGS.map(() => '?').join(',')})`,
      ...KEPT_SETTINGS,
    );
    for (const r of rows) settings[r.key] = r.value;
  } catch {
    /* 旧库没有 meta 表：偏好退回默认值 */
  }
  return {
    favorites,
    history: history.map(({ date, ...key }) => ({ date, key })),
    settings,
  };
}

/** 在新库里按「题目 + 作者 + 首句」找回 poem_id，把收藏与足迹写回去 */
export async function restoreUserData(
  db: SQLiteDatabase,
  plan: RestorePlan | null | undefined,
): Promise<void> {
  if (!plan) return;
  const find = async (k: PoemKey): Promise<number | null> => {
    const row = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM poems
        WHERE title = ? AND author = ? AND substr(content, 1, 12) = ?
        LIMIT 1`,
      k.title,
      k.author,
      k.head,
    );
    return row?.id ?? null;
  };
  for (const k of plan.favorites) {
    const id = await find(k);
    if (id != null) await db.runAsync('INSERT OR IGNORE INTO favorites (poem_id) VALUES (?)', id);
  }
  for (const h of plan.history) {
    const id = await find(h.key);
    if (id != null) {
      await db.runAsync('INSERT OR IGNORE INTO history (date, poem_id) VALUES (?, ?)', h.date, id);
    }
  }
  for (const [key, value] of Object.entries(plan.settings)) {
    await db.runAsync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}

/**
 * 决定这次启动要不要覆盖随包数据库。
 * 会多开一次库读 meta（约几毫秒），换来换库时收藏不丢。
 */
export async function planDatabaseAsset(): Promise<DbPlan> {
  let db: SQLiteDatabase | null = null;
  try {
    db = await openDatabaseAsync(DB_NAME);
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    if (row && Number(row.value) === DB_SCHEMA_VERSION) {
      return { forceOverwrite: false, restore: null };
    }
    return { forceOverwrite: true, restore: await snapshotUserData(db) };
  } catch {
    // 空库 / 没有 meta 表（全新安装）：直接铺随包库，没有用户数据要留
    return { forceOverwrite: true, restore: null };
  } finally {
    try {
      await db?.closeAsync();
    } catch {
      /* 关不掉也无所谓，随包库会覆盖同名文件 */
    }
  }
}
