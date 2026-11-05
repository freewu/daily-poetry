import { dayInfo } from './lunar';
import { isPunctKey } from './punct';
import { bodySizeOf } from './typography';
import type { Poem, PunctKey, Script } from './types';

/** 存相册时用的文件夹名（Android 上是一个 MediaStore bucket） */
export const CARD_ALBUM = '每日诗词';

/** 相册文件名前缀（卡片上不再印它：底部只留「日期 · 农历」） */
export const CARD_BRAND = '每日一诗';

/** 卡片**顶部**的抬头（比底部署名多带出「这是哪个 App」） */
export const CARD_MARK = '每日诗词 APP';

/**
 * 日期戳：`2026-11-03` → `2026年11月3日`。
 * 卡片上不印零填充的月份（11 月不是「11月03日」），所以这里自己拆。
 */
export function cardStamp(date?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? '').trim());
  if (!m) return '';
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 卡片底部那一行：`2026年11月3日 · 农历九月廿五`。
 * 日期没传 / 格式不对 → 空串，调用方据此整块不画（别只留条空横线）。
 */
export function cardDateLine(date?: string | null): string {
  const raw = (date ?? '').trim();
  const stamp = cardStamp(raw);
  if (!stamp) return '';
  return `${stamp} · 农历${dayInfo(raw).lunarDate}`;
}

/** 相册里看到的名字：`每日一诗-静夜思`，去掉空格与路径非法字符 */
export function cardFileName(
  poem: Pick<Poem, 'id' | 'title' | 'name'>,
  date?: string | null,
): string {
  const title = (poem.title || poem.name || '').replace(/[\s\\/:*?"<>|]+/g, '');
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test((date ?? '').trim())
    ? `-${(date as string).replace(/-/g, '')}`
    : '';
  const base = title.slice(0, 24) || `poem-${poem.id}`;
  return `${CARD_BRAND}-${base}${stamp}`;
}

/**
 * 卡片页三个现场开关的「记住上次」键。
 *
 * 它们不是阅读设置：字号默认 18（卡片版式固定）、简繁 / 标点默认跟设置，
 * 所以在 `meta` 里单独存一份，按键只在卡片页读写。
 * 三个键都在 `db-bootstrap.ts` 的 `KEPT_SETTINGS` 白名单里，换库不会把用户的选择清掉。
 */
export const CARD_SIZE_KEY = 'settings_card_size';
export const CARD_SCRIPT_KEY = 'settings_card_script';
export const CARD_PUNCT_KEY = 'settings_card_punct';

/** 读回上次的卡片字号（px）；没存过 / 脏值 → null，沿用卡片默认值 */
export function cardBodyOf(raw: string | null | undefined): number | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  // 越界的旧值交给 bodySizeOf → clampBody 收回到 10–24
  return bodySizeOf(v);
}

/** 读回上次的用字；没存过 → null，跟阅读设置 */
export function cardScriptOf(raw: string | null | undefined): Script | null {
  return raw === 'cn' || raw === 'tw' ? raw : null;
}

/** 读回上次的标点；没存过 → null，跟阅读设置 */
export function cardPunctOf(raw: string | null | undefined): PunctKey | null {
  return isPunctKey(raw) ? raw : null;
}
