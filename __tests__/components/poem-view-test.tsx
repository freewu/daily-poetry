import { fireEvent } from '@testing-library/react-native';

import { PoemCard } from '@/components/poem-card';
import { PoemLines } from '@/components/poem-lines';
import { PoemRow } from '@/components/poem-row';
import type { Poem } from '@/lib/types';

import { renderWithTheme, screen } from '../helpers/test-utils';

const poem: Poem = {
  id: 7,
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
