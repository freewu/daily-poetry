// 简繁切换的纯逻辑：按字体挑字段、缺繁体列时回退简体。
import { localizeCollection, localizePoem, SCRIPT_OPTS } from '@/lib/script';
import type { CollectionMeta, Poem } from '@/lib/types';

const poem: Poem = {
  id: 1,
  collection: 'tangshi',
  name: '唐诗三百首',
  name_tw: '唐詩三百首',
  kind: '五言绝句',
  kind_tw: '五言絕句',
  dynasty: '唐',
  dynasty_tw: '唐',
  author: '李白',
  author_tw: '李白',
  title: '静夜思',
  title_tw: '靜夜思',
  subtitle: '',
  subtitle_tw: '',
  content: '床前明月光\n举头望明月',
  content_tw: '床前明月光\n舉頭望明月',
  daily: 1,
};

describe('SCRIPT_OPTS', () => {
  it('只提供简体 / 繁體两项', () => {
    expect(SCRIPT_OPTS.map((o) => o.key)).toEqual(['cn', 'tw']);
    expect(SCRIPT_OPTS[1].label).toBe('繁體');
  });
});

describe('localizePoem', () => {
  it('简体模式原样返回（含繁体列，不做转换）', () => {
    expect(localizePoem(poem, 'cn')).toBe(poem);
    expect(localizePoem(poem, 'cn').content).toBe('床前明月光\n举头望明月');
  });

  it('繁体模式逐字段取 *_tw', () => {
    const tw = localizePoem(poem, 'tw');
    expect(tw.title).toBe('靜夜思');
    expect(tw.kind).toBe('五言絕句');
    expect(tw.name).toBe('唐詩三百首');
    expect(tw.content).toBe('床前明月光\n舉頭望明月');
    // 原对象不被改动
    expect(poem.title).toBe('静夜思');
  });

  it('缺繁体列时回退简体，不会出现空白', () => {
    const bare: Poem = { ...poem, title_tw: undefined, content_tw: '' };
    const tw = localizePoem(bare, 'tw');
    expect(tw.title).toBe('静夜思');
    expect(tw.content).toBe(poem.content);
  });
});

describe('localizeCollection', () => {
  const coll: CollectionMeta = {
    id: 'quantangshi',
    name: '全唐诗',
    name_tw: '全唐詩',
    kind: '诗',
    kind_tw: '詩',
    count: 57599,
    daily: 0,
  };

  it('简体 / 繁体各取一套', () => {
    expect(localizeCollection(coll, 'cn').name).toBe('全唐诗');
    expect(localizeCollection(coll, 'tw')).toMatchObject({ name: '全唐詩', kind: '詩' });
  });

  it('缺繁体列时回退', () => {
    expect(localizeCollection({ ...coll, name_tw: undefined }, 'tw').name).toBe('全唐诗');
  });
});
