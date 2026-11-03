import { fireEvent, waitFor } from '@testing-library/react-native';

import { PoemActions } from '@/components/poem-actions';
import { copyTextOf } from '@/lib/format';
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
  content: '床前明月光\n疑是地上霜',
  daily: 1,
};

const g = globalThis as any;

describe('<PoemActions />', () => {
  it('未收藏时显示「收藏」，点一下写库并变成「已收藏」', async () => {
    const { db } = await renderWithTheme(<PoemActions poem={poem} />);
    expect(screen.getByText('收藏')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('act-favorite'));

    await waitFor(() => expect(screen.getByText('已收藏')).toBeTruthy());
    expect(db.raw.prepare('SELECT poem_id FROM favorites').all()).toEqual([{ poem_id: 1 }]);
  });

  it('已收藏时显示「已收藏」，再点一下取消', async () => {
    // 先在库里写好收藏，再渲染
    const db = createTestDb();
    await asDb(db).runAsync('INSERT INTO favorites (poem_id) VALUES (?)', poem.id);
    await renderWithTheme(<PoemActions poem={poem} />, { db });

    await waitFor(() => expect(screen.getByText('已收藏')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('act-favorite'));

    await waitFor(() => expect(screen.getByText('收藏')).toBeTruthy());
    expect(db.raw.prepare('SELECT COUNT(*) n FROM favorites').get()).toEqual({ n: 0 });
  });

  it('复制按钮把落款完整的文本写进剪贴板', async () => {
    await renderWithTheme(<PoemActions poem={poem} />);
    await fireEvent.press(screen.getByTestId('act-copy'));

    await waitFor(() => expect(screen.getByText('已复制')).toBeTruthy());
    expect(g.__CLIPBOARD__.setStringAsync).toHaveBeenCalledWith(copyTextOf(poem));
  });

  it('朗读：未朗读时读全文，朗读中再点则停止', async () => {
    await renderWithTheme(<PoemActions poem={poem} />);
    await fireEvent.press(screen.getByTestId('act-speak'));

    await waitFor(() => expect(g.__SPEECH__.speak).toHaveBeenCalled());
    expect(g.__SPEECH__.speak).toHaveBeenCalledWith(
      '静夜思，李白。床前明月光。疑是地上霜',
      expect.objectContaining({ language: 'zh-CN' }),
    );
    await waitFor(() => expect(screen.getByText('停止')).toBeTruthy());

    // 模拟系统 TTS 正在朗读
    g.__SPEECH__.isSpeakingAsync.mockResolvedValueOnce(true);
    await fireEvent.press(screen.getByTestId('act-speak'));

    await waitFor(() => expect(g.__SPEECH__.stop).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('朗读')).toBeTruthy());
  });

  it('卸载时停掉朗读', async () => {
    const view = await renderWithTheme(<PoemActions poem={poem} />);
    await view.unmount();
    expect(g.__SPEECH__.stop).toHaveBeenCalled();
  });
});
