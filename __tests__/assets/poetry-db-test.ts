// 随包 SQLite 数据的冒烟测试：assets/poetry.db 是 `just db` 的产物（不入库），
// 没有就先跑一次构建；这里校验的是「装进 APK 的那份数据」本身可用。
//
// 关注点：结构完整、每日池可轮换、应景检索真能命中、全新安装时收藏为空。
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  dayNumber,
  DB_SCHEMA_VERSION,
  getSetting,
  pickPoemForDate,
  poemForDay,
  poemForOccasion,
  searchPoems,
  shiftDayStr,
  poemsOfAuthor,
} from '@/lib/db';
import { compareLetters, groupAuthors } from '@/lib/authors';
import { dayInfo, occasionFor } from '@/lib/lunar';
import { statsOf } from '@/lib/stats';
import type { Poem } from '@/lib/types';

import { asDb, openDbFile, type TestDb } from '../helpers/memory-db';

const DB_FILE = path.resolve(__dirname, '../../assets/poetry.db');
const hasDb = existsSync(DB_FILE);

let db: TestDb;

beforeAll(() => {
  if (hasDb) db = openDbFile(DB_FILE);
});

afterAll(() => {
  db?.close();
});

const describeDb = hasDb ? describe : describe.skip;

if (!hasDb) {
  // eslint-disable-next-line no-console
  console.warn('assets/poetry.db 不存在，请先执行 `just db`；已跳过数据校验');
}

describeDb('assets/poetry.db（随包数据）', () => {
  it('meta 里记录了语料范围 / 首数 / 构建时间', async () => {
    expect(await getSetting(asDb(db), 'dataset')).toBeTruthy();
    expect(await getSetting(asDb(db), 'poem_count')).toMatch(/^\d+$/);
    expect(await getSetting(asDb(db), 'built_at')).toBeTruthy();
  });

  it('库结构版本与 App 期望一致（否则启动会换库）', async () => {
    expect(await getSetting(asDb(db), 'schema_version')).toBe(String(DB_SCHEMA_VERSION));
  });

  it('诗词数与 meta 记录一致', async () => {
    const meta = Number(await getSetting(asDb(db), 'poem_count'));
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM poems');
    expect(row?.n).toBe(meta);
  });

  it('每首诗都有正文，且所属选集都存在', async () => {
    const empty = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE TRIM(content) = '' OR TRIM(title) = ''",
    );
    expect(empty?.n).toBe(0);

    const orphan = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM poems p LEFT JOIN collections c ON c.id = p.collection WHERE c.id IS NULL',
    );
    expect(orphan?.n).toBe(0);
  });

  it('每首都有繁体文本，繁体源保留原文、简体源由 OpenCC 转写', async () => {
    const empty = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE TRIM(content_tw) = '' OR TRIM(title_tw) = ''",
    );
    expect(empty?.n).toBe(0);

    // 唐诗三百首是简体源 → cn→tw
    const cnSrc = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'tangshi' AND title = '静夜思'",
    );
    expect(cnSrc?.content).toContain('举头');
    expect(cnSrc?.content_tw).toContain('舉頭');

    // 全唐诗是繁体源 → 原文里的「髮」不会被转成简体再转回来
    const twSrc = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'quantangshi' AND content_tw LIKE '%白髮%' LIMIT 1",
    );
    expect(twSrc).not.toBeNull();
    expect(twSrc?.content).toContain('白发');
    expect(twSrc?.content_tw).toContain('白髮');
  });

  it('选集名 / 体裁也有繁体', async () => {
    // 全量库（just db-full）比标准库多几部杂项，所以逐行校验「每一行都写了繁体」，
    // 再点名几个两种库都该有的选集。
    const rows = await db.getAllAsync<{ id: string; name: string; name_tw: string; kind_tw: string }>(
      'SELECT id, name, name_tw, kind_tw FROM collections',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.name_tw?.trim() || !r.kind_tw?.trim())).toEqual([]);

    expect(rows.find((r) => r.id === 'tangshi')).toMatchObject({
      name: '唐诗三百首',
      name_tw: '唐詩三百首',
      kind_tw: '詩',
    });

    // 全宋词 / 元曲 属于主体语料（just db 就该在），别再退化成「有就校验」
    expect(rows.find((r) => r.id === 'ci')).toMatchObject({
      name: '全宋词',
      name_tw: '全宋詞',
      kind_tw: '詞',
    });
    expect(rows.find((r) => r.id === 'qu')).toMatchObject({
      name: '元曲',
      name_tw: '元曲',
      kind_tw: '曲',
    });
  });

  it('每日池非空，且一整年轮换不重复、不漏日', async () => {
    const pool = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM poems WHERE daily = 1',
    );
    const size = pool?.n ?? 0;
    expect(size).toBeGreaterThan(1000);

    // 一整年：每天都有诗，且 7 天内不出现同一作者（默认冷却档）
    const authors: string[] = [];
    const ids = new Set<number>();
    let date = '2024-01-01';
    for (let i = 0; i < 365; i++) {
      const p = await poemForDay(asDb(db), date);
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.daily).toBe(1);
      authors.push(p.author);
      ids.add(p.id);
      date = shiftDayStr(date, 1);
    }
    for (let i = 0; i < authors.length; i++) {
      for (let k = 1; k < 7 && i - k >= 0; k++) {
        expect(authors[i]).not.toBe(authors[i - k]);
      }
    }
    // 一年下来不是只在几位诗人里打转
    expect(ids.size).toBeGreaterThan(200);
  });

  it('同一日期取到同一首（可复现）', async () => {
    const date = '2024-09-17';
    const a = await poemForDay(asDb(db), date);
    const again = await poemForDay(asDb(db), date);
    expect(a?.id).toBe(again?.id);
  });

  it('30 天档在真实语料里也拉得开', async () => {
    const authors: string[] = [];
    let date = '2024-01-01';
    for (let i = 0; i < 60; i++) {
      const p = await poemForDay(asDb(db), date, 30);
      expect(p?.daily).toBe(1);
      authors.push(p!.author);
      date = shiftDayStr(date, 1);
    }
    for (let i = 0; i < authors.length; i++) {
      for (let k = 1; k < 30 && i - k >= 0; k++) {
        expect(authors[i]).not.toBe(authors[i - k]);
      }
    }
  });

  it('中秋 / 重阳 能在真实语料里命中应景诗（题目或正文含关键词）', async () => {
    const cases: { date: string; occId: string }[] = [
      { date: '2024-09-17', occId: 'fest-zhongqiu' },
      { date: '2025-10-29', occId: 'fest-chongyang' },
    ];
    for (const c of cases) {
      const occ = occasionFor(dayInfo(c.date));
      expect(occ?.id).toBe(c.occId);
      const p = await poemForOccasion(asDb(db), c.date, occ!);
      expect(p).not.toBeNull();
      expect(occ!.keywords.some((k) => `${p!.title}${p!.content}`.includes(k))).toBe(true);
    }
  });

  it('端午：精选池里没有，也能用节日名在全库里找到', async () => {
    const occ = occasionFor(dayInfo('2024-06-10'))!;
    expect(occ.id).toBe('fest-duanwu');
    const p = await poemForOccasion(asDb(db), '2024-06-10', occ);
    expect(p).not.toBeNull();
    expect(`${p!.title}${p!.content}`).toContain('端午');

    const pick = await pickPoemForDate(asDb(db), '2024-06-10', occ);
    expect(pick.occasion).toBe(true);
    expect(pick.poem?.id).toBe(p?.id);
  });

  it('每个节气都能应景（24 个节气在全库里都有诗）', async () => {
    // 立春 / 惊蛰 / 小满 这类冷门节气精选池里一首都没有，靠全库兜底
    const days = ['2024-02-04', '2024-03-05', '2024-05-20', '2024-12-21'];
    for (const date of days) {
      const occ = occasionFor(dayInfo(date));
      expect(occ?.kind).toBe('term');
      const p = await poemForOccasion(asDb(db), date, occ!);
      expect(p).not.toBeNull();
      expect(`${p!.title}${p!.content}`).toContain(occ!.label);
    }
  });

  it('纳兰性德 / 曹操 两部新集子都在，且进了每日池', async () => {
    const rows = await db.getAllAsync<{ id: string; count: number; daily: number }>(
      "SELECT id, count, daily FROM collections WHERE id IN ('nalan','caocao') ORDER BY id",
    );
    // daily 是「算不算精选集」的标志位，不是首数
    expect(rows).toEqual([
      { id: 'caocao', count: 26, daily: 1 },
      { id: 'nalan', count: 258, daily: 1 },
    ]);
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM poems WHERE collection = 'nalan' AND daily = 0")).toEqual({ n: 0 });
  });

  it('纳兰 / 曹操是简体源，繁体列由 OpenCC 转写（不是照抄简体）', async () => {
    const ci = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'nalan' AND title = '长相思·山一程'",
    );
    expect(ci?.content_tw).toContain('榆關');
    expect(ci?.title_tw).toContain('長相思');
    expect(ci?.content).toContain('榆关');

    // 曹操集里「於铄贤圣」的「於」不能把整首误判成繁体源（曾经踩过：繁体列存成了简体）
    const cao = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'caocao' AND title = '度关山'",
    );
    expect(cao?.content).toContain('于铄贤圣');
    expect(cao?.content_tw).toContain('於鑠賢聖');
    expect(cao?.author_tw).toBe('曹操');
    expect(cao?.dynasty).toBe('东汉');
  });

  it('乐府诗集：一百卷都进了库，且不占每日池', async () => {
    const row = await db.getFirstAsync<{ id: string; name: string; name_tw: string; kind: string; kind_tw: string; count: number; daily: number }>(
      "SELECT * FROM collections WHERE id = 'yuefu'",
    );
    expect(row).toMatchObject({
      id: 'yuefu',
      name: '乐府诗集',
      name_tw: '樂府詩集',
      kind: '乐府',
      kind_tw: '樂府',
      daily: 0, // 郊庙乐章不进每日轮换
    });
    expect(row?.count).toBeGreaterThan(3000);
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM poems WHERE collection = 'yuefu' AND daily = 1")).toEqual({ n: 0 });
  });

  it('乐府诗集：subtitle 记了卷次 / 曲调，繁体与简体各自成列', async () => {
    const p = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'yuefu' AND title = '练时日'",
    );
    expect(p?.subtitle).toBe('卷一 · 郊庙歌辞一 · 汉郊祀歌');
    expect(p?.title_tw).toBe('練時日');
    expect(p?.content).toContain('练时日　侯有望');
    expect(p?.content_tw).toContain('練時日　侯有望');

    // 第五十八卷是没维基化的纯文本页，标题旁的「朝代·作者」要拆成两列
    const shi = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'yuefu' AND title = '思归引' AND author = '石崇'",
    );
    expect(shi?.subtitle).toBe('卷五十八 · 琴曲歌辞二 · 思归引');
    expect(shi?.dynasty).toBe('晋');
    expect(shi?.author_tw).toBe('石崇');
  });

  it('乐府诗集：作者统计与库对得上（页面读 stats.json）', async () => {
    const yuefu = statsOf('yuefu')?.authors ?? [];
    const count = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE collection = 'yuefu'",
    );
    expect(yuefu.reduce((n, a) => n + a.count, 0)).toBe(count?.n);
    expect(yuefu.find((a) => a.name === '李白')?.count).toBeGreaterThan(50);
  });

  it('纳兰那首缺题目的词用首句补了题目（不留空标题）', async () => {
    const empty = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE collection IN ('nalan','caocao') AND (TRIM(title) = '' OR TRIM(content) = '')",
    );
    expect(empty).toEqual({ n: 0 });
    const noTitle = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'nalan' AND content LIKE '朔风吹古柳%'",
    );
    expect(noTitle?.title).toBe('朔风吹古柳');
  });

  it('宋词三百首：整本选集都在，且进了每日池', async () => {
    const row = await db.getFirstAsync<{
      id: string; name: string; name_tw: string; kind: string; kind_tw: string; count: number; daily: number;
    }>("SELECT * FROM collections WHERE id = 'songci300'");
    expect(row).toMatchObject({
      id: 'songci300',
      name: '宋词三百首',
      name_tw: '宋詞三百首',
      kind: '词',
      kind_tw: '詞',
      daily: 1, // 选本，跟唐诗三百首 / 千家诗 一样进池
    });
    // 古文岛这部选集连唐五代词一起收，比朱孝臧 1924 年那本（300 首）略少
    expect(row?.count).toBeGreaterThan(280);
    expect(
      await db.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) n FROM poems WHERE collection = 'songci300' AND daily = 0",
      ),
    ).toEqual({ n: 0 });
  });

  it('宋词三百首：题目是「词牌·首句」，副题留空（否则词牌统计会串）', async () => {
    // 古文岛按「词牌·首句」命名，`cipaiOf()` 取 `·` 前段，词牌统计才对得上
    const yuanxi = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'songci300' AND title = '青玉案·元夕'",
    );
    expect(yuanxi?.author).toBe('辛弃疾');
    expect(yuanxi?.author_tw).toBe('辛棄疾');
    expect(yuanxi?.subtitle).toBe('');
    expect(yuanxi?.content).toContain('众里寻他千百度');
    expect(yuanxi?.content_tw).toContain('眾裡尋他千百度');

    // 词序（`丙辰中秋…`）是正文第一行，不是副题
    const mid = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'songci300' AND title = '水调歌头·丙辰中秋'",
    );
    expect(mid?.content.split('\n')[0]).toContain('丙辰中秋');
    expect(mid?.subtitle).toBe('');

    // 五代人（冯延巳）不该标成宋
    const wu = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'songci300' AND author = '冯延巳'",
    );
    expect(wu?.dynasty).toBe('五代');
  });

  it('宋词三百首：作者 / 词牌统计与库对得上', async () => {
    const stat = statsOf('songci300');
    const count = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE collection = 'songci300'",
    );
    expect(stat?.total).toBe(count?.n);
    expect((stat?.authors ?? []).reduce((n, a) => n + a.count, 0)).toBe(count?.n);
    // 这部选集里吴文英 5 首，词牌最多的是清平乐（11 首）
    expect(stat?.authors.find((a) => a.name === '吴文英')?.count).toBe(5);
    expect(stat?.cipai[0]).toMatchObject({ name: '清平乐', count: 11 });
  });

  it('毛泽东诗词：145 首都在，且不进每日池', async () => {
    const row = await db.getFirstAsync<{
      id: string; name: string; name_tw: string; kind: string; kind_tw: string; count: number; daily: number;
    }>("SELECT * FROM collections WHERE id = 'mao'");
    expect(row).toMatchObject({
      id: 'mao',
      name: '毛泽东诗词',
      name_tw: '毛澤東詩詞',
      kind: '诗词',
      kind_tw: '詩詞',
      count: 145,
      daily: 0, // 一半是残篇 / 联句 / 题词，不进轮换
    });
    expect(
      await db.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) n FROM poems WHERE collection = 'mao' AND daily = 1",
      ),
    ).toEqual({ n: 0 });
  });

  it('毛泽东诗词：题目是「体裁·题目」，写作日期进副题', async () => {
    const changzheng = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'mao' AND title = '七律·长征'",
    );
    expect(changzheng?.author).toBe('毛泽东');
    expect(changzheng?.author_tw).toBe('毛澤東');
    expect(changzheng?.dynasty).toBe('现代');
    expect(changzheng?.subtitle).toBe('1935年10月');
    expect(changzheng?.content.split('\n')[0]).toBe('红军不怕远征难，万水千山只等闲。');
    expect(changzheng?.content_tw).toContain('紅軍不怕遠征難');

    // 词牌的「词」只在题目里（`沁园春·长沙`），副题不能抢着认词牌
    const changsha = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'mao' AND title = '沁园春·长沙'",
    );
    expect(changsha?.subtitle).toBe('1925年秋');

    // 组诗拆成「·其N」单首（十六字令三首 / 七律二首·送瘟神 / 十六字令八首）
    const series = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE collection = 'mao' AND title LIKE '%·其%'",
    );
    expect(series?.n).toBe(15);
  });

  it('作者统计：数量对得上选集，名家的首字母也对', async () => {
    // 页面读的是建库时算好、随包走的 assets/stats.json（见 lib/stats.ts）
    const tang = statsOf('tangshi')?.authors ?? [];
    const count = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE collection = 'tangshi'",
    );
    // 每位作者的作品数加起来 = 这个集子的总首数（一首都不能漏）
    expect(tang.reduce((n, a) => n + a.count, 0)).toBe(count?.n);
    expect(new Set(tang.map((a) => a.name)).size).toBe(tang.length);

    const groups = groupAuthors(tang);
    const letters = groups.map((g) => g.initial);
    expect(letters).toEqual([...letters].sort(compareLetters));
    const li = groups.find((g) => g.initial === 'L')?.data.map((a) => a.name) ?? [];
    expect(li).toContain('李白');
    const du = groups.find((g) => g.initial === 'D')?.data.map((a) => a.name) ?? [];
    expect(du).toContain('杜甫');
  });

  it('全唐诗的作者统计也扛得住（几千位作者）', async () => {
    const all = statsOf('quantangshi')?.authors ?? [];
    expect(all.length).toBeGreaterThan(1000);
    // 按作品数排序找得到「杜甫」这种大户
    const top = [...all].sort((a, b) => b.count - a.count)[0];
    expect(top.count).toBeGreaterThan(100);
    // 首字母分组不会漏人
    const grouped = groupAuthors(all).reduce((n, g) => n + g.data.length, 0);
    expect(grouped).toBe(all.length);
  });

  it('点开一位作者只看到他的作品', async () => {
    const li = await poemsOfAuthor(asDb(db), 'tangshi', '李白');
    expect(li.length).toBeGreaterThan(0);
    expect(li.every((p) => p.author === '李白')).toBe(true);
    expect(li.every((p) => p.collection === 'tangshi')).toBe(true);
  });

  it('全文检索能搜到名篇', async () => {
    const hits = await searchPoems(asDb(db), '静夜思', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toContain('静夜思');
    expect(hits[0].author).toContain('李白');
  });

  it('繁体查询也能命中（简繁两列一起检索）', async () => {
    const hits = await searchPoems(asDb(db), '靜夜思', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('静夜思');
  });

  it('全新安装的库没有被写脏（收藏 / 足迹为空）', async () => {
    expect(await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM favorites')).toEqual({ n: 0 });
    expect(await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM history')).toEqual({ n: 0 });
  });
});
