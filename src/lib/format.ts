import type { Poem } from './types';

/** 「朝代 · 作者」组合；无朝代/作者时返回可用部分 */
export function attributionOf(p: Pick<Poem, 'dynasty' | 'author'>): string {
  const dyn = (p.dynasty ?? '').trim();
  const author = (p.author ?? '').trim();
  if (dyn && author) return `${dyn} · ${author}`;
  return author || dyn || '';
}

/** 出处行：选自《集名》·副题 */
export function sourceOf(p: Poem): string {
  const base = `选自《${p.name}》`;
  const sub = (p.subtitle ?? '').trim();
  return sub ? `${base} · ${sub}` : base;
}

/** 复制用的整段文本 */
export function copyTextOf(p: Poem): string {
  const attr = attributionOf(p);
  const head = [attr, sourceOf(p)].filter(Boolean).join('，');
  const body = p.content.trim();
  return head ? `${body}\n\n—— ${head}` : body;
}

/** 正文是否按诗句居中排布（近体/古体诗与短词句） */
export function isVerse(p: Poem): boolean {
  const lines = p.content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const max = Math.max(...lines.map((l) => l.length));
  return max <= 20;
}

export function linePreview(p: Poem, n = 1): string {
  return p.content.split('\n').filter(Boolean).slice(0, n).join(' / ');
}
