import {
  attributionOf,
  copyTextOf,
  isVerse,
  linePreview,
  sourceOf,
} from '@/lib/format';
import type { Poem } from '@/lib/types';

const poem: Poem = {
  id: 1,
  collection: 'tang',
  name: '唐诗三百首',
  kind: '五言绝句',
  dynasty: '唐',
  author: '李白',
  title: '静夜思',
  subtitle: '',
  content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
  daily: 1,
};

describe('format/attributionOf', () => {
  it('朝代与作者都有时用「·」连接', () => {
    expect(attributionOf({ dynasty: '唐', author: '李白' })).toBe('唐 · 李白');
  });

  it('缺少朝代或作者时只返回可用部分', () => {
    expect(attributionOf({ dynasty: '唐', author: '' })).toBe('唐');
    expect(attributionOf({ dynasty: '', author: '佚名' })).toBe('佚名');
    expect(attributionOf({ dynasty: '  ', author: '  ' })).toBe('');
  });
});

describe('format/sourceOf', () => {
  it('无副题时只给出处', () => {
    expect(sourceOf(poem)).toBe('选自《唐诗三百首》');
  });

  it('有副题时以「·」追加', () => {
    expect(sourceOf({ ...poem, subtitle: '其一' })).toBe('选自《唐诗三百首》 · 其一');
  });

  it('副题只有空白时忽略', () => {
    expect(sourceOf({ ...poem, subtitle: '   ' })).toBe('选自《唐诗三百首》');
  });
});

describe('format/copyTextOf', () => {
  it('正文 + 出处落款', () => {
    expect(copyTextOf(poem)).toBe(
      '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡\n\n—— 唐 · 李白，选自《唐诗三百首》',
    );
  });

  it('无作者无朝代时不留空落款', () => {
    const text = copyTextOf({ ...poem, dynasty: '', author: '' });
    expect(text).toBe(`${poem.content}\n\n—— 选自《唐诗三百首》`);
  });
});

describe('format/isVerse', () => {
  it('多行且每行较短 → 按诗句居中', () => {
    expect(isVerse(poem)).toBe(true);
  });

  it('单行文本 → 不居中', () => {
    expect(isVerse({ ...poem, content: '明月几时有' })).toBe(false);
  });

  it('长句（散文式） → 不居中', () => {
    const long = `${'天地玄黄'.repeat(6)}\n${'宇宙洪荒'.repeat(6)}`;
    expect(isVerse({ ...poem, content: long })).toBe(false);
  });

  it('忽略空行', () => {
    expect(isVerse({ ...poem, content: '一行\n\n二行\n\n' })).toBe(true);
  });
});

describe('format/linePreview', () => {
  it('默认取第一行', () => {
    expect(linePreview(poem)).toBe('床前明月光');
  });

  it('可要求多行，跳过空行', () => {
    const p = { ...poem, content: '\n第一句\n第二句\n第三句' };
    expect(linePreview(p, 2)).toBe('第一句 / 第二句');
  });

  it('不足行数时给多少算多少', () => {
    expect(linePreview({ ...poem, content: '孤句' }, 3)).toBe('孤句');
  });
});
