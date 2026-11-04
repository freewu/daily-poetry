import type { Poem } from './types';

/**
 * 词牌：库里没有独立的列，得从题目 / 副题里认。
 *
 * - 全宋词：词牌**就是题目**（`ci.song.*.json` 里只有 rhythmic，建库时写进了 title），
 *   形式是『词牌』或『别名・词牌』
 * - 花间集：题目是『词牌·首句』，副题是「卷N·词牌」
 * - 南唐词：题目 = 『词牌·首句』 || rhythmic，副题 = rhythmic
 * - 纳兰性德词：题目 = 『词牌·首句』
 *
 * 所以副题里有词牌就用副题，否则退回题目里的词牌段（规则见下面两个间隔号的注释）。
 * 不给它单开一列：词牌是题目的派生物，加列要连带改 schema / 重打库，
 * 而 2 万首现算一遍也就几十毫秒。
 */

/** 花间集的卷次前缀：`卷1·浣溪沙` / `卷10 菩萨蛮` */
const VOLUME = /^卷\s*\d+\s*[·.、]?\s*/;

/**
 * 两种间隔号，语料里语义相反，取哪一段完全不同：
 *
 * - `·`（U+00B7 间隔号）= 词牌 · 题目/首句，如『长相思·山一程』『虞美人·春花秋月何时了』
 * - `・`（U+30FB 片假名中点）= **别名** · 正名，全宋词认真时用的，如『酹江月・念奴娇』
 *   『凤栖梧・蝶恋花』—— 前段是别名，词牌在后面
 *
 * 全宋词 21049 首里有 2377 首是后一种（且它从不用 `·`）；
 * 按别名各算一词牌会把 1409 个名字抖出来，认正名后归并成 884 个。
 */
const TOPIC_SEP = '·';
const ALIAS_SEP = '・';

function cipaiFromText(text: string): string {
  const name = text.trim();
  if (!name) return '';
  if (name.includes(ALIAS_SEP)) {
    const parts = name
      .split(ALIAS_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }
  return name.split(TOPIC_SEP)[0].trim();
}

function cipaiFrom(title: string | undefined, subtitle: string | undefined): string {
  const sub = (subtitle ?? '').trim().replace(VOLUME, '').trim();
  return cipaiFromText(sub || (title ?? ''));
}

/** 简体词牌（检索 / 分组 / 唯一键都用它） */
export const cipaiOf = (poem: Pick<Poem, 'title' | 'subtitle'>): string =>
  cipaiFrom(poem.title, poem.subtitle);

/** 繁體词牌：同一套规则，只是优先取繁体列（繁体模式下词牌名也要跟着换） */
export const cipaiOfTw = (
  poem: Pick<Poem, 'title' | 'subtitle' | 'title_tw' | 'subtitle_tw'>,
): string => cipaiFrom(poem.title_tw || poem.title, poem.subtitle_tw || poem.subtitle);

/** 只有「词」这一类集子谈得上词牌（元曲是曲牌，没做） */
export const isCiKind = (kind: string) => kind.trim() === '词';

export interface CipaiStat {
  /** 简体词牌（分组 / 跳转都用它） */
  name: string;
  /** 繁體词牌，缺了回退简体 */
  nameTw?: string;
  /** 这个集子里该词牌的作品数 */
  count: number;
}

/** 集子里出现过的词牌，作品多的在前（同数按词牌名） */
export function countCipai(
  poems: readonly Pick<Poem, 'title' | 'subtitle' | 'title_tw' | 'subtitle_tw'>[],
): CipaiStat[] {
  const stats = new Map<string, CipaiStat>();
  for (const poem of poems) {
    const name = cipaiOf(poem);
    if (!name) continue;
    const hit = stats.get(name);
    if (hit) {
      hit.count += 1;
      continue;
    }
    // 繁体跟简体一样就不存，页面 `nameTw ?? name` 一个式子搞定
    const tw = cipaiOfTw(poem);
    stats.set(name, { name, nameTw: tw && tw !== name ? tw : undefined, count: 1 });
  }
  return [...stats.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}
