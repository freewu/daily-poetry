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

/** 预置竖排的内存库 */
function dbVertical(): TestDb {
  const db = useMemoryDb();
  db.raw.exec("INSERT INTO meta (key, value) VALUES ('settings_layout', 'vertical')");
  return db;
}

/** 预置「竖排 + 空白断句」的内存库 */
function dbVerticalSpace(): TestDb {
  const db = dbVertical();
  db.raw.exec("INSERT INTO meta (key, value) VALUES ('settings_punct', 'space')");
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

  it('宋体 + 特大：正文收到上限 24 号、衬线族、行距按比例放大', async () => {
    // 老库里 'xl' 换算出来是 27.3，比新上限 24 大，clampBody 会收到 24
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, {
      db: dbWithType('song', 'xl'),
    });
    await waitFor(() =>
      expect(screen.getByText(poem.content)).toHaveStyle({ fontSize: 24, fontFamily: 'serif' }),
    );
    expect(screen.getByText(poem.content)).toHaveStyle({ lineHeight: Math.round(24 * 1.85) });
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

describe('竖排', () => {
  it('每行原文变成一列，字竖直堆叠', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, { db: dbVertical() });
    await waitFor(() => expect(screen.getByTestId('poem-vertical')).toBeTruthy());
    // 4 行 → 4 列，每列逐字换行
    expect(screen.getByText('床\n前\n明\n月\n光')).toBeTruthy();
    expect(screen.getByText('低\n头\n思\n故\n乡')).toBeTruthy();
    // 横排的整段文本不再出现
    expect(screen.queryByText(poem.content)).toBeNull();
  });

  it('列从右往左排（row-reverse），整体居中', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, { db: dbVertical() });
    const box = screen.getByTestId('poem-vertical');
    expect(box.props.contentContainerStyle).toMatchObject({
      flexDirection: 'row-reverse',
      justifyContent: 'center',
    });
  });

  it('字号 / 字族照样生效', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, {
      db: (() => {
        const db = dbVertical();
        db.raw.exec("INSERT INTO meta (key, value) VALUES ('settings_font','song'), ('settings_font_size','lg')");
        return db;
      })(),
    });
    const col = await screen.findByText('床\n前\n明\n月\n光');
    expect(col).toHaveStyle({ fontSize: 24, fontFamily: 'serif' });
  });

  it('长诗横向溢出时从第一列（最右）读起', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />, { db: dbVertical() });
    const box = screen.getByTestId('poem-vertical');
    expect(box.props.horizontal).toBe(true);
    // row-reverse 下 scrollX=0 是最左（末句），所以挂载 / 内容尺寸变化时滚到最右
    expect(typeof box.props.onContentSizeChange).toBe('function');
  });

  it('卡片里的正文也竖排', async () => {
    await renderWithTheme(<PoemCard poem={poem} />, { db: dbVertical() });
    await waitFor(() => expect(screen.getByTestId('poem-vertical')).toBeTruthy());
    expect(screen.getByText('举\n头\n望\n明\n月')).toBeTruthy();
  });

  it('空白断句：标点原位留一格空位（竖排也照样占位）', async () => {
    const withPunct = { ...poem, content: '床前明月光，疑是地上霜' };
    await renderWithTheme(<PoemLines poem={withPunct} color="#000" />, { db: dbVerticalSpace() });
    await waitFor(() => expect(screen.getByTestId('poem-vertical')).toBeTruthy());
    // 「，」换成空格，竖排里一个空格 = 一整格空位，跟字一样高
    expect(screen.getByText('床\n前\n明\n月\n光\n\u3000\n疑\n是\n地\n上\n霜')).toBeTruthy();
  });

  it('默认横排：不出竖排容器', async () => {
    await renderWithTheme(<PoemLines poem={poem} color="#000" />);
    expect(screen.queryByTestId('poem-vertical')).toBeNull();
    expect(screen.getByText(poem.content)).toBeTruthy();
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
