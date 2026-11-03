import { fireEvent, waitFor } from '@testing-library/react-native';

import { PoemCard } from '@/components/poem-card';
import { PoemLines } from '@/components/poem-lines';
import { PoemRow } from '@/components/poem-row';
import type { Poem } from '@/lib/types';

import { renderWithTheme, screen, useMemoryDb, type TestDb } from '../helpers/test-utils';

const poem: Poem = {
  id: 7,
  collection: 'tang',
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
  content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
  content_tw: '床前明月光\n疑是地上霜\n舉頭望明月\n低頭思故鄉',
  daily: 1,
};

/** 预置「正文字体 = 繁體」的内存库，模拟用户在设置里选过繁體 */
function dbWithTw(): TestDb {
  const db = useMemoryDb();
  db.raw.exec("INSERT INTO meta (key, value) VALUES ('settings_script', 'tw')");
  return db;
}

/** 预置字体 / 字号的内存库 */
function dbWithType(font: string, size: string): TestDb {
  const db = useMemoryDb();
  db.raw.exec(
    `INSERT INTO meta (key, value) VALUES ('settings_font', '${font}'), ('settings_font_size', '${size}')`,
  );
  return db;
}

describe('<PoemCard />', () => {
  it('画出体裁 / 题目 / 作者 / 正文 / 出处', async () => {
    await renderWithTheme(<PoemCard poem={poem} testID="card" />);
    expect(screen.getByText('五言绝句')).toBeTruthy();
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('唐 · 李白')).toBeTruthy();
    expect(screen.getByText(poem.content)).toBeTruthy();
    expect(screen.getByText('选自《唐诗三百首》')).toBeTruthy();
    expect(screen.getByTestId('card')).toBeTruthy();
  });

  it('题目缺失时退回集名', async () => {
    await renderWithTheme(<PoemCard poem={{ ...poem, title: '' }} />);
    expect(screen.getByText('唐诗三百首')).toBeTruthy();
  });

  it('无作者时不画作者行', async () => {
    await renderWithTheme(<PoemCard poem={{ ...poem, dynasty: '', author: '' }} />);
    expect(screen.queryByText('唐 · 李白')).toBeNull();
  });
});

describe('简繁切换', () => {
  it('繁体模式：题目 / 体裁 / 正文 / 出处都用繁體', async () => {
    await renderWithTheme(<PoemCard poem={poem} testID="card" />, { db: dbWithTw() });
    await waitFor(() => expect(screen.getByText('靜夜思')).toBeTruthy());
    expect(screen.getByText('五言絕句')).toBeTruthy();
    expect(screen.getByText(poem.content_tw as string)).toBeTruthy();
    expect(screen.getByText(/唐詩三百首/)).toBeTruthy();
    expect(screen.queryByText(poem.content)).toBeNull();
  });

  it('列表行也跟着切换', async () => {
    await renderWithTheme(<PoemRow poem={poem} />, { db: dbWithTw() });
    await waitFor(() => expect(screen.getByText('靜夜思')).toBeTruthy());
    expect(screen.getByText('唐 · 李白 · 床前明月光')).toBeTruthy();
  });

  it('默认简体：不动繁体列', async () => {
    await renderWithTheme(<PoemCard poem={poem} />);
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText(poem.content)).toBeTruthy();
  });
});

describe('字体与字号', () => {
  it('默认：正文 21 号，不指定 fontFamily', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />);
    expect(screen.getByText(poem.content)).toHaveStyle({ fontSize: 21 });
    expect(screen.getByText(poem.content).props.style.fontFamily).toBeUndefined();
  });

  it('宋体 + 特大：正文 27 号、衬线族、行距按比例放大', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, {
      db: dbWithType('song', 'xl'),
    });
    await waitFor(() =>
      expect(screen.getByText(poem.content)).toHaveStyle({ fontSize: 27, fontFamily: 'serif' }),
    );
    expect(screen.getByText(poem.content)).toHaveStyle({ lineHeight: Math.round(27 * 1.85) });
  });

  it('卡片题目与作者跟着缩放，正文用同一字族', async () => {
    await renderWithTheme(<PoemCard poem={poem} />, { db: dbWithType('song', 'lg') });
    await waitFor(() =>
      expect(screen.getByText('静夜思')).toHaveStyle({ fontSize: Math.round(27 * 1.15) }),
    );
    expect(screen.getByText('静夜思')).toHaveStyle({ fontFamily: 'serif' });
    expect(screen.getByText('唐 · 李白')).toHaveStyle({ fontSize: Math.round(14 * 1.15) });
    expect(screen.getByText(poem.content)).toHaveStyle({ fontFamily: 'serif' });
  });

  it('列表行也跟着缩放', async () => {
    await renderWithTheme(<PoemRow poem={poem} index={1} />, { db: dbWithType('song', 'sm') });
    await waitFor(() =>
      expect(screen.getByText('静夜思')).toHaveStyle({ fontSize: Math.round(16 * 0.9) }),
    );
  });

  it('显式传 fontSize 时以传入值为准（预览用）', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" fontSize={40} />, {
      db: dbWithType('song', 'xl'),
    });
    expect(screen.getByText(poem.content)).toHaveStyle({ fontSize: 40 });
  });
});

describe('<PoemLines />', () => {
  it('诗句居中排版', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />);
    expect(screen.getByText(poem.content)).toHaveStyle({ textAlign: 'center' });
  });

  it('长文左对齐', async () => {
    const long = { ...poem, content: `${'天地玄黄'.repeat(8)}\n${'宇宙洪荒'.repeat(8)}` };
    await renderWithTheme(<PoemLines poem={long} color="#000" />);
    expect(screen.getByText(long.content)).toHaveStyle({ textAlign: 'left' });
  });
});

describe('<PoemRow />', () => {
  it('画出序号 / 题目 / 作者与首句', async () => {
    await renderWithTheme(<PoemRow poem={poem} index={3} />);
    expect(screen.getByText('003')).toBeTruthy();
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('唐 · 李白 · 床前明月光')).toBeTruthy();
  });

  it('点击进入诗词详情', async () => {
    await renderWithTheme(<PoemRow poem={poem} />);
    await fireEvent.press(screen.getByTestId('poem-row-7'));
    expect((globalThis as any).__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/poem/[id]',
      params: { id: '7' },
    });
  });
});
