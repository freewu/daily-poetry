import { StyleSheet } from 'react-native';
import { within } from '@testing-library/react-native';

import { CARD_BODY, ShareCard } from '@/components/share-card';
import type { Poem } from '@/lib/types';

import { asDb, createTestDb, renderWithTheme, screen } from '../helpers/test-utils';

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

/** 用繁体列 + 竖排偏好，验证卡片的取舍 */
async function dbWith(opts: { tw?: boolean; vertical?: boolean } = {}) {
  const db = createTestDb();
  const set = async (k: string, v: string) =>
    asDb(db).runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', k, v);
  if (opts.tw) await set('settings_script', 'tw');
  if (opts.vertical) await set('settings_layout', 'vertical');
  return db;
}

describe('<ShareCard />', () => {
  it('排上题目、作者、正文、出处与日期戳', async () => {
    await renderWithTheme(<ShareCard poem={poem} date="2026-11-03" width={340} />, {
      db: await dbWith(),
    });
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('唐 · 李白')).toBeTruthy();
    expect(screen.getByText(/床前明月光/)).toBeTruthy();
    expect(screen.getByText('选自《唐诗三百首》')).toBeTruthy();
    expect(screen.getByText('每日诗词 APP')).toBeTruthy();
    // 底部只有「日期 · 农历」，不再印 App 名（抬头已经写着「每日诗词 APP」）
    expect(screen.getByTestId('share-card-stamp')).toBeTruthy();
    expect(screen.getByText('2026年11月3日 · 农历九月廿五')).toBeTruthy();
    expect(screen.queryByText('每日一诗')).toBeNull();
    expect(screen.getByText('五言绝句')).toBeTruthy();
  });

  it('体裁（诗 / 词）跟在「每日诗词 APP」后面，同一行', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={340} />, { db: await dbWith() });
    const head = screen.getByTestId('share-card-head');
    const texts = within(head)
      .getAllByText(/.+/)
      .map((n) => n.props.children);
    expect(texts).toEqual(['每日诗词 APP', '五言绝句']);
  });

  it('不传日期就整块不印日期戳（连分隔线一起）', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={340} />, { db: await dbWith() });
    expect(screen.getByText('每日诗词 APP')).toBeTruthy();
    expect(screen.queryByTestId('share-card-stamp')).toBeNull();
    expect(screen.queryByText(/\d{4}年\d{1,2}月\d{1,2}日/)).toBeNull();
    expect(screen.queryByText('每日一诗')).toBeNull();
  });

  it('跟着简繁设置走（繁体用 title_tw / content_tw）', async () => {
    const tw: Poem = {
      ...poem,
      title_tw: '靜夜思',
      content_tw: '床前明月光\n疑是地上霜',
    };
    await renderWithTheme(<ShareCard poem={tw} width={340} />, { db: await dbWith({ tw: true }) });
    expect(screen.getByText('靜夜思')).toBeTruthy();
  });

  it('卡片固定横排：设置里选了竖排也不变竖列', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={340} />, {
      db: await dbWith({ vertical: true }),
    });
    expect(screen.queryByTestId('poem-vertical')).toBeNull();
    // 四句还是一段横排文本（含换行），不是四个竖列
    expect(screen.getByText(/举头望明月/).props.children).toContain('\n');
  });

  it('没有题目 / 作者时退回选集名，作者行整个不印', async () => {
    const bare: Poem = { ...poem, title: '', author: '', dynasty: '', subtitle: '' };
    await renderWithTheme(<ShareCard poem={bare} width={340} />, { db: await dbWith() });
    // 题目空 → 用 name（选集名）顶上，卡片不会空一块
    expect(screen.getByText('唐诗三百首')).toBeTruthy();
    // 没有朝代 / 作者，就不画「唐 · 李白」那一行
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('宽度按传入值走', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={377} testID="share-card" />, {
      db: await dbWith(),
    });
    const style = screen.getByTestId('share-card').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flat.width).toBe(377);
  });

  it('不传字号就用卡片默认 18 号', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={340} />, { db: await dbWith() });
    const body = StyleSheet.flatten(screen.getByText(/床前明月光/).props.style) as {
      fontSize?: number;
    };
    expect(CARD_BODY).toBe(18);
    expect(body.fontSize).toBe(18);
  });

  it('传了字号就跟着走，题目按 1.4 倍等比放大', async () => {
    await renderWithTheme(<ShareCard poem={poem} width={340} bodySize={25} />, {
      db: await dbWith(),
    });
    const body = StyleSheet.flatten(screen.getByText(/床前明月光/).props.style) as {
      fontSize?: number;
    };
    const title = StyleSheet.flatten(screen.getByText('静夜思').props.style) as {
      fontSize?: number;
    };
    expect(body.fontSize).toBe(25);
    // 卡片不会出现「标题比正文还小」
    expect(title.fontSize).toBe(35);
  });

  it('简繁可以不跟设置（卡片页现场选）', async () => {
    const tw: Poem = { ...poem, title_tw: '靜夜思', content_tw: '床前明月光' };
    await renderWithTheme(<ShareCard poem={tw} width={340} script="cn" />, {
      db: await dbWith({ tw: true }),
    });
    expect(screen.getByText('静夜思')).toBeTruthy();
  });

  it('标点可以不跟设置（卡片页现场选「空」）', async () => {
    const punctPoem: Poem = { ...poem, content: '床前明月光，疑是地上霜。' };
    await renderWithTheme(<ShareCard poem={punctPoem} width={340} punct="space" />, {
      db: await dbWith(),
    });
    expect(screen.getByText(/床前明月光 疑是地上霜/)).toBeTruthy();
    expect(screen.queryByText(/床前明月光，/)).toBeNull();
  });
});
