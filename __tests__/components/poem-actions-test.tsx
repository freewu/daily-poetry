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
const HAD_VOICES = g.__SPEECH__.voices;

afterEach(() => {
  // 模拟「没有 TTS 引擎」的用例会把 voices 置空，用完改回来
  g.__SPEECH__.voices = HAD_VOICES;
});

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

  it('朗读语速跟随设置（settings_tts_rate）', async () => {
    const db = createTestDb();
    await asDb(db).runAsync("INSERT INTO meta (key, value) VALUES ('settings_tts_rate', 'slow')");
    await renderWithTheme(<PoemActions poem={poem} />, { db });
    await fireEvent.press(screen.getByTestId('act-speak'));

    await waitFor(() => expect(g.__SPEECH__.speak).toHaveBeenCalled());
    expect(g.__SPEECH__.speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rate: 0.7 }),
    );
  });

  it('语速没设置时用默认值 0.9', async () => {
    await renderWithTheme(<PoemActions poem={poem} />);
    await fireEvent.press(screen.getByTestId('act-speak'));

    await waitFor(() => expect(g.__SPEECH__.speak).toHaveBeenCalled());
    expect(g.__SPEECH__.speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rate: 0.9 }),
    );
  });

  it('卸载时停掉朗读', async () => {
    const view = await renderWithTheme(<PoemActions poem={poem} />);
    await view.unmount();
    expect(g.__SPEECH__.stop).toHaveBeenCalled();
  });

  it('传了 onCard 才出现「存图」，点一下回调出去', async () => {
    const onCard = jest.fn();
    await renderWithTheme(<PoemActions poem={poem} onCard={onCard} />);
    await fireEvent.press(screen.getByTestId('act-card'));
    expect(onCard).toHaveBeenCalledTimes(1);
  });

  it('没传 onCard 就不显示「存图」', async () => {
    await renderWithTheme(<PoemActions poem={poem} />);
    expect(screen.queryByTestId('act-card')).toBeNull();
  });

  it('系统没有语音合成时不出「朗读」，其它按钮照旧', async () => {
    g.__SPEECH__.voices = [];
    await renderWithTheme(<PoemActions poem={poem} />);

    await waitFor(() => expect(screen.queryByTestId('act-speak')).toBeNull());
    expect(screen.getByTestId('act-favorite')).toBeTruthy();
    expect(screen.getByTestId('act-copy')).toBeTruthy();
    expect(g.__SPEECH__.getAvailableVoicesAsync).toHaveBeenCalled();
  });
});
