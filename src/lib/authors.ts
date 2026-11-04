import { pinyin } from 'pinyin-pro';

import type { Script } from './types';

/**
 * 作者统计：语料是按作者排的，一个集子里动辄上千位作者，得按姓首字母分组才能翻。
 *
 * 首字母靠 `pinyin-pro` 现算（`surname: 'all'` 才会把「曾 / 单 / 仇 / 查 / 乐」
 * 读成姓氏音 zēng / shàn / qiú / zhā / yuè，不然「曾巩」会被排进 C）。
 * 只有几百位作者，现算一遍是毫秒级的，不值得为它改表结构 / 重打数据库。
 */

/** 归不到 A–Z 的一档（佚名 / 音译名），永远排在字母后面 */
export const OTHER_LETTER = '#';

/** 语料里没署名的诗，统计时统一叫「佚名」 */
export const ANONYMOUS = '佚名';

/**
 * 语料里常见的「假作者」：它们不是人名，按拼音排进 Y / W 只是噪音，
 * 统一归到「其他」那一档（显示还是原样，不硬改成「佚名」）。
 */
const ANON_NAMES = new Set(['佚名', '无名氏', '无名', '不详', '佚名氏']);

export const isAnonymousName = (name: string) => {
  const text = name.trim();
  return !text || ANON_NAMES.has(text);
};

export interface AuthorStat {
  /** 简体署名（分组与排序都用它）；空串 = 语料里没署名 */
  name: string;
  /** 繁体署名，缺了回退简体 */
  nameTw?: string;
  /** 该集子里收录的作品数 */
  count: number;
}

export interface AuthorSection {
  /** 分组字母：A–Z 或 # */
  initial: string;
  data: AuthorStat[];
}

const isLetter = (c: string) => c >= 'a' && c <= 'z';

/** 全拼（无声调、小写），同字母内按它排，读起来才顺 */
export function sortKeyOf(name: string): string {
  const text = name.trim();
  if (isAnonymousName(text)) return '\uffff'; // 佚名垫底
  return pinyin(text, { surname: 'all', toneType: 'none' }).toLowerCase();
}

/** 姓首字母大写；判断不出来（佚名 / 生僻字 / 音译名）归到 # */
export function initialOf(name: string): string {
  const text = name.trim();
  if (isAnonymousName(text)) return OTHER_LETTER;
  // 个别作者是拉丁字母写的（“Li Bai”），直接用首字母
  const latin = /^[a-z]/i.exec(text);
  if (latin) return latin[0].toUpperCase();
  const syllables = pinyin(text, { surname: 'all', toneType: 'none', type: 'array' });
  const head = (syllables[0] ?? '').trim().toLowerCase()[0] ?? '';
  return isLetter(head) ? head.toUpperCase() : OTHER_LETTER;
}

/** A–Z 在前，# 垫底 */
export function compareLetters(a: string, b: string): number {
  if (a === b) return 0;
  if (a === OTHER_LETTER) return 1;
  if (b === OTHER_LETTER) return -1;
  return a < b ? -1 : 1;
}

/** 把作者按首字母分组：组间 A→Z（# 最后），组内作品多的在前（同数再按全拼） */
export function groupAuthors(rows: AuthorStat[]): AuthorSection[] {
  const buckets = new Map<string, { row: AuthorStat; key: string }[]>();
  for (const row of rows) {
    const letter = initialOf(row.name);
    const list = buckets.get(letter);
    const entry = { row, key: sortKeyOf(row.name) };
    if (list) list.push(entry);
    else buckets.set(letter, [entry]);
  }
  return [...buckets.entries()]
    .sort((a, b) => compareLetters(a[0], b[0]))
    .map(([initial, list]) => ({
      initial,
      data: list
        // 作品数降序：同一姓下谁是这本集子的主力，一眼就看到
        .sort(
          (a, b) =>
            b.row.count - a.row.count ||
            a.key.localeCompare(b.key) ||
            a.row.name.localeCompare(b.row.name),
        )
        .map((e) => e.row),
    }));
}

/** 界面上显示的名字：跟简繁设置走，没署名就显示「佚名」 */
export function authorLabel(row: AuthorStat, script: Script): string {
  const name = script === 'tw' ? row.nameTw || row.name : row.name;
  return name || ANONYMOUS;
}

/** 分组标题：「其他」比一个 # 好认 */
export const letterLabel = (initial: string) =>
  initial === OTHER_LETTER ? '其他' : initial;
