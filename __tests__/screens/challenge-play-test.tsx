import { fireEvent, waitFor } from '@testing-library/react-native';

import ChallengePlayScreen from '@/app/challenge/[pool]';
import { buildChallenge, CHALLENGE_SIZE } from '@/lib/challenge';
import { challengeLog, challengePoems } from '@/lib/db';

import {
  asDb,
  renderWithTheme,
  screen,
  seedCollections,
  seedFavorites,
  seedPoems,
  useMemoryDb,
} from '../helpers/test-utils';

const g = globalThis as any;
const SEED = 20261105;

/** 十首四句诗：足够凑一局，每句 5 字（都在挖空区间里） */
const POEMS = [
  ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
  ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'],
  ['空山不见人', '但闻人语响', '返景入深林', '复照青苔上'],
  ['千山鸟飞绝', '万径人踪灭', '孤舟蓑笠翁', '独钓寒江雪'],
  ['红豆生南国', '春来发几枝', '愿君多采撷', '此物最相思'],
  ['松下问童子', '言师采药去', '只在此山中', '云深不知处'],
  ['移舟泊烟渚', '日暮客愁新', '野旷天低树', '江清月近人'],
  ['终南阴岭秀', '积雪浮云端', '林表明霁色', '城中增暮寒'],
  ['独坐幽篁里', '弹琴复长啸', '深林人不知', '明月来相照'],
  ['月落乌啼霜满天', '江枫渔火对愁眠', '姑苏城外寒山寺', '夜半钟声到客船'],
];

function seed() {
  const db = useMemoryDb();
  seedCollections(db, [{ id: 'tang', name: '唐诗三百首', kind: '诗', count: POEMS.length, daily: 1 }]);
  seedPoems(
    db,
    POEMS.map((lines, i) => ({
      id: i + 1,
      collection: 'tang',
      name: '唐诗三百首',
      title: `诗${i + 1}`,
      author: `作者${i + 1}`,
      dynasty: '唐',
      content: lines.join('\n'),
    })),
  );
  seedFavorites(db, [1, 2, 3, 4]);
  return db;
}

/** 跟页面完全同一套输入（同一个池子、同一个种子）算出题目，用来知道正确答案 */
async function expected(db: ReturnType<typeof seed>, pool = 'tang') {
  return buildChallenge(await challengePoems(asDb(db), pool), SEED, CHALLENGE_SIZE);
}

/** 按给定的选择序列答完一局（index 为 null 表示随便挑一个错的） */
async function answerAll(picks: (number | null)[]) {
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i] ?? 0;
    await fireEvent.press(screen.getByTestId(`challenge-option-${pick}`));
    await fireEvent.press(screen.getByTestId('challenge-next'));
  }
}

describe('<ChallengePlayScreen />（出题 → 作答 → 结果）', () => {
  it('先出第一题：挖空的行带空位，四个选项', async () => {
    const db = seed();
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });

    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());
    expect(screen.getByTestId('challenge-progress').props.children.join('')).toBe('第 1 / 10 题');
    expect(screen.getByTestId('challenge-blank')).toBeTruthy();
    for (let i = 0; i < 4; i++) expect(screen.getByTestId(`challenge-option-${i}`)).toBeTruthy();
    // 没选之前不能翻页
    expect(screen.getByTestId('challenge-next').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('下一题')).toBeTruthy();
  });

  it('全对：10 / 10，诗仙下凡，并且记进战绩（用时 / 参与时间 / 来源）', async () => {
    const db = seed();
    const qs = await expected(db);
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    await answerAll(qs.map((q) => q.answerIndex));

    expect(screen.getByTestId('challenge-score').props.children[0]).toBe(10);
    expect(screen.getByText('诗仙下凡')).toBeTruthy();
    expect(screen.getByTestId('challenge-perfect')).toBeTruthy();
    expect(screen.getByTestId('challenge-stats').props.children.join('')).toContain('唐诗三百首');

    await waitFor(async () => expect(await challengeLog(asDb(db))).toHaveLength(1));
    const [rec] = await challengeLog(asDb(db));
    expect(rec).toMatchObject({ pool: 'tang', poolName: '唐诗三百首', total: 10, correct: 10 });
    expect(rec.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(rec.at))).toBe(false);
  });

  it('八题答对：优秀；错题回顾里给出正确答案', async () => {
    const db = seed();
    const qs = await expected(db);
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    // 前八题选对，后两题故意选错
    const picks = qs.map((q, i) =>
      i < 8 ? q.answerIndex : (q.answerIndex + 1) % q.options.length,
    );
    await answerAll(picks);

    expect(screen.getByTestId('challenge-score').props.children[0]).toBe(8);
    expect(screen.getByTestId('challenge-rank').props.children).toBe('优秀');
    expect(screen.getAllByTestId('challenge-wrong')).toHaveLength(2);

    await waitFor(async () => expect(await challengeLog(asDb(db))).toHaveLength(1));
    expect((await challengeLog(asDb(db)))[0].correct).toBe(8);
  });

  it('一题不对：不及格，错题回顾列满十题', async () => {
    const db = seed();
    const qs = await expected(db);
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    await answerAll(qs.map((q) => (q.answerIndex + 1) % q.options.length));

    expect(screen.getByTestId('challenge-score').props.children[0]).toBe(0);
    expect(screen.getByText('不及格')).toBeTruthy();
    expect(screen.getAllByTestId('challenge-wrong')).toHaveLength(10);
    await waitFor(async () => expect((await challengeLog(asDb(db)))[0].correct).toBe(0));
  });

  it('选了就定住：正确项变绿勾，再点别的选项不再改答案', async () => {
    const db = seed();
    const qs = await expected(db);
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    const right = qs[0].answerIndex;
    const wrong = (right + 1) % qs[0].options.length;
    await fireEvent.press(screen.getByTestId(`challenge-option-${right}`));
    expect(screen.getByTestId('challenge-correct').props.children.join('')).toBe('已答对 1 题');

    // 已经答过，再点错的也不会改（按钮 disabled）
    await fireEvent.press(screen.getByTestId(`challenge-option-${wrong}`));
    expect(screen.getByTestId('challenge-correct').props.children.join('')).toBe('已答对 1 题');
  });

  it('收藏也能开局：pool=favorites', async () => {
    const db = seed();
    const qs = await expected(db, 'favorites');
    g.__ROUTE_PARAMS__ = { pool: 'favorites', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    expect(screen.getByText('我的收藏')).toBeTruthy();
    await answerAll(qs.map((q) => q.answerIndex));
    await waitFor(async () => {
      const [rec] = await challengeLog(asDb(db));
      expect(rec).toMatchObject({ pool: 'favorites', poolName: '我的收藏', correct: 10 });
    });
  });

  it('来源不存在就直说', async () => {
    g.__ROUTE_PARAMS__ = { pool: 'nope', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('challenge-missing')).toBeTruthy());
  });

  it('「再来一局」换种子重开：分数清零，重新从第一题开始', async () => {
    const db = seed();
    const qs = await expected(db);
    g.__ROUTE_PARAMS__ = { pool: 'tang', seed: String(SEED) };
    await renderWithTheme(<ChallengePlayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('challenge-progress')).toBeTruthy());

    await answerAll(qs.map((q) => q.answerIndex));
    expect(screen.getByTestId('challenge-score').props.children[0]).toBe(10);

    await fireEvent.press(screen.getByTestId('challenge-again'));
    await waitFor(() =>
      expect(screen.getByTestId('challenge-progress').props.children.join('')).toBe('第 1 / 10 题'),
    );
    expect(screen.getByTestId('challenge-correct').props.children.join('')).toBe('已答对 0 题');

    // 第二局换了个种子：题目不一样，答完再记一条（新的排在前面）
    const pool = await challengePoems(asDb(db), 'tang');
    const qs2 = buildChallenge(pool, SEED + 1, CHALLENGE_SIZE);
    expect(qs2.map((q) => q.answer)).not.toEqual(qs.map((q) => q.answer));
    await answerAll(qs2.map((q) => q.answerIndex));
    await waitFor(async () => expect(await challengeLog(asDb(db))).toHaveLength(2));
    expect((await challengeLog(asDb(db))).every((r) => r.correct === 10)).toBe(true);
  });
});
