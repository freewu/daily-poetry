import type { Poem } from './types';

/** 存相册时用的文件夹名（Android 上是一个 MediaStore bucket） */
export const CARD_ALBUM = '每日诗词';

/** 卡片底部署名 */
export const CARD_BRAND = '每日一诗';

/**
 * 日期戳：`2026-11-03` → `2026年11月3日`。
 * 卡片上不印零填充的月份（11 月不是「11月03日」），所以这里自己拆。
 */
export function cardStamp(date?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? '').trim());
  if (!m) return '';
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
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
