// 换库时保留用户数据：旧库抄出收藏 / 足迹，新库里按「题目 + 作者 + 首句」找回来。
import { restoreUserData, snapshotUserData } from '@/lib/db-bootstrap';

import { asDb, seedPoems, useMemoryDb } from './helpers/memory-db';

/** 与 snapshotUserData 一致：正文前 12 字 */
const headOf = (content: string) => content.slice(0, 12);

const POEMS = [
  { id: 1, title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
  { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓\n处处闻啼鸟' },
  // 同名不同诗：靠首句区分
  { id: 3, title: '静夜思', author: '李白', content: '另一首同题诗' },
];

describe('snapshotUserData', () => {
  it('抄出收藏与足迹，带上题目 / 作者 / 首句', async () => {
    const db = useMemoryDb();
    seedPoems(db, POEMS);
    db.raw.exec("INSERT INTO favorites (poem_id) VALUES (1), (3)");
    db.raw.exec("INSERT INTO history (date, poem_id) VALUES ('2024-09-17', 2)");

    const plan = await snapshotUserData(asDb(db));
    expect(plan.favorites).toEqual([
      { title: '静夜思', author: '李白', head: headOf('床前明月光\n疑是地上霜') },
      { title: '静夜思', author: '李白', head: headOf('另一首同题诗') },
    ]);
    expect(plan.history).toEqual([
      { date: '2024-09-17', key: { title: '春晓', author: '孟浩然', head: headOf('春眠不觉晓\n处处闻啼鸟') } },
    ]);
  });

  it('空库（没有收藏）时给出空计划', async () => {
    const db = useMemoryDb();
    seedPoems(db, POEMS);
    expect(await snapshotUserData(asDb(db))).toEqual({ favorites: [], history: [], settings: {} });
  });

  it('偏好设置也抄一份（换库会连 meta 一起换掉）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POEMS);
    db.raw.exec(
      `INSERT INTO meta (key, value) VALUES
         ('settings_theme', 'dark'), ('settings_script', 'tw'),
         ('settings_font', 'song'), ('settings_font_size', 'xl'), ('settings_layout', 'vertical'),
         ('settings_tts_rate', 'slow'), ('settings_card_size', '23'),
         ('settings_card_punct', 'space'), ('dataset', 'standard')`,
    );
    const plan = await snapshotUserData(asDb(db));
    expect(plan.settings).toEqual({
      settings_theme: 'dark',
      settings_script: 'tw',
      settings_font: 'song',
      settings_font_size: 'xl',
      settings_layout: 'vertical',
      settings_tts_rate: 'slow',
      // 卡片页「记住上次」的三个键也得跟着走，否则换库把用户的选择清掉
      settings_card_size: '23',
      settings_card_punct: 'space',
    });
  });
});

describe('restoreUserData', () => {
  it('在新库里按题目 + 作者 + 首句找回 id 并写回', async () => {
    const db = useMemoryDb();
    // 新库 id 全变了，顺序也不同
    seedPoems(db, [
      { id: 10, title: '静夜思', author: '李白', content: '另一首同题诗' },
      { id: 11, title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
      { id: 12, title: '春晓', author: '孟浩然', content: '春眠不觉晓\n处处闻啼鸟' },
    ]);

    await restoreUserData(asDb(db), {
      favorites: [
        { title: '静夜思', author: '李白', head: headOf('床前明月光\n疑是地上霜') },
        { title: '静夜思', author: '李白', head: headOf('另一首同题诗') },
      ],
      history: [
        { date: '2024-09-17', key: { title: '春晓', author: '孟浩然', head: headOf('春眠不觉晓\n处处闻啼鸟') } },
      ],
      settings: { settings_script: 'tw' },
    });

    const favs = db.raw.prepare('SELECT poem_id FROM favorites ORDER BY poem_id').all();
    expect(favs).toEqual([{ poem_id: 10 }, { poem_id: 11 }]);
    expect(db.raw.prepare('SELECT date, poem_id FROM history').all()).toEqual([
      { date: '2024-09-17', poem_id: 12 },
    ]);
    // 偏好写回 meta
    expect(db.raw.prepare("SELECT value FROM meta WHERE key = 'settings_script'").get()).toEqual({
      value: 'tw',
    });
  });

  it('新库里找不到对应诗就跳过，不报错', async () => {
    const db = useMemoryDb();
    seedPoems(db, [{ id: 1, title: '春晓', author: '孟浩然', content: '春眠不觉晓' }]);

    await restoreUserData(asDb(db), {
      favorites: [{ title: '静夜思', author: '李白', head: headOf('床前明月光') }],
      history: [],
      settings: {},
    });
    expect(db.raw.prepare('SELECT COUNT(*) n FROM favorites').get()).toEqual({ n: 0 });
  });

  it('重复恢复同一份计划不会写重', async () => {
    const db = useMemoryDb();
    seedPoems(db, POEMS);
    const plan = {
      favorites: [{ title: '静夜思', author: '李白', head: headOf('床前明月光\n疑是地上霜') }],
      history: [{ date: '2024-09-17', key: { title: '春晓', author: '孟浩然', head: headOf('春眠不觉晓\n处处闻啼鸟') } }],
      settings: {},
    };
    await restoreUserData(asDb(db), plan);
    await restoreUserData(asDb(db), plan);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM favorites').get()).toEqual({ n: 1 });
    expect(db.raw.prepare('SELECT COUNT(*) n FROM history').get()).toEqual({ n: 1 });
  });

  it('没有计划时什么都不做', async () => {
    const db = useMemoryDb();
    seedPoems(db, POEMS);
    await restoreUserData(asDb(db), null);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM favorites').get()).toEqual({ n: 0 });
  });
});
