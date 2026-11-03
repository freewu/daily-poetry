import type { CollectionMeta, Poem, Script } from './types';

/**
 * 简繁两套文本都随库发布（见 scripts/build-db.mjs）：繁体列是语料原文，
 * 简体列是 OpenCC t→cn 的结果。这里只做「按字段挑选」，App 端不需要转换库。
 *
 * 繁体列缺失（老库 / 测试里手工塞的行）时回退到简体，不会出现空白。
 */
export const SCRIPT_OPTS: { key: Script; label: string; hint: string }[] = [
  { key: 'cn', label: '简体', hint: '正文用大陆简体（OpenCC 转写）' },
  { key: 'tw', label: '繁體', hint: '正文用傳統繁體（保留語料原文）' },
];

export function localizePoem(p: Poem, script: Script): Poem {
  if (script !== 'tw') return p;
  return {
    ...p,
    name: p.name_tw || p.name,
    kind: p.kind_tw || p.kind,
    dynasty: p.dynasty_tw || p.dynasty,
    author: p.author_tw || p.author,
    title: p.title_tw || p.title,
    subtitle: p.subtitle_tw || p.subtitle,
    content: p.content_tw || p.content,
  };
}

export function localizeCollection(c: CollectionMeta, script: Script): CollectionMeta {
  if (script !== 'tw') return c;
  return { ...c, name: c.name_tw || c.name, kind: c.kind_tw || c.kind };
}
