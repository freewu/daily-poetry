import {
  BLANK,
  CHALLENGE_SIZE,
  buildChallenge,
  clausesOf,
  formatDuration,
  formatStamp,
  linesOf,
  parseLog,
  pushRecord,
  rankOf,
  RANKS,
  summarize,
  type ChallengeRecord,
} from '@/lib/challenge';
import type { Poem } from '@/lib/types';

/** 一首四句、每句 5 字以上，正好每行都能挖空 */
function poem(id: number, lines: string[], extra: Partial<Poem> = {}): Poem {
  return {
    id,
    collection: 'tang',
    name: '唐诗三百首',
    kind: '诗',
    dynasty: '唐',
    author: `作者${id}`,
    title: `诗${id}`,
    subtitle: '',
    content: lines.join('\n'),
    daily: 1,
    ...extra,
  };
}

const POEMS: Poem[] = [
  poem(1, ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡']),
  poem(2, ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼']),
  poem(3, ['空山不见人', '但闻人语响', '返景入深林', '复照青苔上']),
  poem(4, ['千山鸟飞绝', '万径人踪灭', '孤舟蓑笠翁', '独钓寒江雪']),
  poem(5, ['红豆生南国', '春来发几枝', '愿君多采撷', '此物最相思']),
  poem(6, ['松下问童子', '言师采药去', '只在此山中', '云深不知处']),
  poem(7, ['移舟泊烟渚', '日暮客愁新', '野旷天低树', '江清月近人']),
  poem(8, ['终南阴岭秀', '积雪浮云端', '林表明霁色', '城中增暮寒']),
  poem(9, ['独坐幽篁里', '弹琴复长啸', '深林人不知', '明月来相照']),
  poem(10, ['月落乌啼霜满天', '江枫渔火对愁眠', '姑苏城外寒山寺', '夜半钟声到客船']),
  poem(11, ['银烛秋光冷画屏', '轻罗小扇扑流萤', '天阶夜色凉如水', '卧看牵牛织女星']),
];

describe('linesOf / clausesOf', () => {
  it('切行去掉空行与首尾空白', () => {
    expect(linesOf('  床前明月光 \n\n  疑是地上霜\n')).toEqual(['床前明月光', '疑是地上霜']);
  });

  it('长行按标点断句，标点留在句外；太短太长的句子不当候选', () => {
    const lines = ['明月几时有？把酒问青天。', '不知天上宫阙今夕是何年'];
    const got = clausesOf(lines).map((c) => c.text);
    // 「明月几时有」5 字留着；「把酒问青天」也留着；最后那句 11 字刚好在上限内
    expect(got).toContain('明月几时有');
    expect(got).toContain('把酒问青天');
    expect(got).toContain('不知天上宫阙今夕是何年');
    expect(got).not.toContain('明月几时有？');
  });

  it('挖空句的字数有上下限（4 字以下 / 17 字以上都不要）', () => {
    const lines = ['床前光', '这是一个特别特别长的句子超过了十六个字的上限啊'];
    expect(clausesOf(lines)).toEqual([]);
  });

  it('起止位置能在原行里切出那句话', () => {
    const line = '明月几时有？把酒问青天。';
    const c = clausesOf([line])[0];
    expect(line.slice(c.start, c.end)).toBe(c.text);
  });
});

describe('语料噪声（全唐诗《补录》里混的校勘记）', () => {
  it('括号 / 引号也断句，注明里的短碎片不会成为候选', () => {
    const got = clausesOf(['（见《文苑英华》卷一四七）', '床前明月光']).map((c) => c.text);
    expect(got).toEqual(['床前明月光']);
  });

  it('正文带 〖〗［］ 的整理稿整首跳过（不是诗，挖出来像乱码）', () => {
    const note = poem(20, ['阳耀求便洒，阴霖请复晴。', '（〖1〗句次成公简诗句后）']);
    expect(buildChallenge([note], 1)).toEqual([]);
    const ok = buildChallenge([...POEMS.slice(0, 4), note], 3);
    expect(ok.some((q) => q.poemId === 20)).toBe(false);
    expect(ok.length).toBeGreaterThan(0);
  });

  it('候选句只收汉字（夹着数字 / 字母的不挖）', () => {
    const got = clausesOf(['卷1第一首之异文 A']).map((c) => c.text);
    expect(got).toEqual([]);
  });
});

describe('buildChallenge', () => {
  it('`${CHALLENGE_SIZE}` 题，每题四选一，答案在选项里', () => {
    const qs = buildChallenge(POEMS, 7);
    expect(qs).toHaveLength(CHALLENGE_SIZE);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answerIndex]).toBe(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
      // 干扰项不能等于答案
      expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
      // 题干里那一行确实被挖空了
      expect(q.lines[q.blankLine]).toContain(BLANK);
      expect(q.lines.filter((l) => l.includes(BLANK))).toHaveLength(1);
    }
  });

  it('同一个种子出同一份题（换设备 / 重开一局都能复现）', () => {
    const a = buildChallenge(POEMS, 20261105);
    const b = buildChallenge(POEMS, 20261105);
    expect(b.map((q) => q.answer)).toEqual(a.map((q) => q.answer));
    expect(b.map((q) => q.answerIndex)).toEqual(a.map((q) => q.answerIndex));
  });

  it('换种子就换题', () => {
    const a = buildChallenge(POEMS, 1).map((q) => q.answer);
    const b = buildChallenge(POEMS, 2).map((q) => q.answer);
    expect(b).not.toEqual(a);
  });

  it('诗不够十首时再轮一遍：一首诗的不同句子各出一题', () => {
    const three = POEMS.slice(0, 3);
    const qs = buildChallenge(three, 5);
    expect(qs.length).toBeGreaterThan(3);
    // 同一首诗可以出多题，但同一句不会挖两次
    const keys = qs.map((q) => `${q.poemId}|${q.answer}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('池子里只有一首诗也能出题（干扰项靠它自己的其它句子）', () => {
    const qs = buildChallenge([POEMS[0]], 3);
    expect(qs.length).toBe(4);
    expect(new Set(qs.map((q) => q.answer)).size).toBe(4);
  });

  it('没内容的诗跳过；全空就出不了题', () => {
    expect(buildChallenge([], 1)).toEqual([]);
    expect(buildChallenge([poem(99, ['   '])], 1)).toEqual([]);
  });

  it('题干里带着诗题与作者（方便认出处）', () => {
    const q = buildChallenge(POEMS, 7)[0];
    expect(q.title).toBe(`诗${q.poemId}`);
    expect(q.attribution).toBe(`唐 · 作者${q.poemId}`);
  });
});

describe('rankOf：门槛在代码里（6 及格 / 8 优秀 / 10 诗仙下凡）', () => {
  const keys = [0, 3, 5, 6, 7, 8, 9, 10].map((n) => rankOf(n, 10).key);
  it('十题制分档', () => {
    expect(keys).toEqual(['fail', 'fail', 'fail', 'pass', 'pass', 'good', 'good', 'immortal']);
  });

  it('不足十题按比例走，全对永远是最高的评价', () => {
    expect(rankOf(3, 5).key).toBe('pass'); // 60%
    expect(rankOf(4, 5).key).toBe('good'); // 80%
    expect(rankOf(5, 5).key).toBe('immortal');
    expect(rankOf(0, 0).key).toBe('fail'); // 没出题的极端情况不算通过
  });

  it('评级名字就是需求里那三个词', () => {
    expect(rankOf(6, 10).label).toBe('及格');
    expect(rankOf(8, 10).label).toBe('优秀');
    expect(rankOf(10, 10).label).toBe('诗仙下凡');
  });

  it('不到五题就只给一句「加油」（不写「不及格」也不写分数线）', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(rankOf(n, 10).label).toBe('加油');
    }
    // 5 / 10 也没到及格线，同样是「加油」
    expect(rankOf(5, 10).label).toBe('加油');
  });

  it('提示语里不出现题数 —— 分数线不上 UI，别从 hint 漏出去', () => {
    for (const key of ['fail', 'pass', 'good', 'immortal'] as const) {
      expect(RANKS[key].hint).not.toMatch(/[0-9一二三四五六七八九十]\s*题/);
      expect(RANKS[key].hint).not.toContain('/');
    }
  });
});

describe('formatDuration / formatStamp', () => {
  it('一分钟以内只报秒', () => {
    expect(formatDuration(42_000)).toBe('42 秒');
    expect(formatDuration(0)).toBe('0 秒');
  });

  it('一分钟以上报分秒（秒补零），十分钟以上只报分', () => {
    expect(formatDuration(65_000)).toBe('1 分 05 秒');
    expect(formatDuration(600_000)).toBe('10 分');
  });

  it('脏值当 0', () => {
    expect(formatDuration(Number.NaN)).toBe('0 秒');
    expect(formatDuration(-5)).toBe('0 秒');
  });

  it('参与时间按本地时区显示', () => {
    const at = new Date(2026, 10, 5, 14, 32).toISOString();
    expect(formatStamp(at)).toBe('11月5日 14:32');
  });

  it('坏时间原样退回，不抛', () => {
    expect(formatStamp('not-a-date')).toBe('not-a-date');
  });
});

describe('战绩（meta KV 里的 JSON）', () => {
  const rec = (i: number, correct: number): ChallengeRecord => ({
    at: new Date(2026, 10, 5, 14, i).toISOString(),
    pool: 'tang',
    poolName: '唐诗三百首',
    total: 10,
    correct,
    ms: 60_000 + i,
  });

  it('脏数据一律当空', () => {
    expect(parseLog(null)).toEqual([]);
    expect(parseLog('')).toEqual([]);
    expect(parseLog('{oops')).toEqual([]);
    expect(parseLog('{"a":1}')).toEqual([]);
    expect(parseLog('[1,"x",null]')).toEqual([]);
  });

  it('坏条目挑掉，好条目留着', () => {
    const raw = JSON.stringify([rec(1, 6), { at: 'x' }, rec(2, 8)]);
    expect(parseLog(raw).map((r) => r.correct)).toEqual([6, 8]);
  });

  it('新的排最前，只留最近若干局', () => {
    const log = pushRecord([rec(1, 6)], rec(2, 8), 2);
    expect(log.map((r) => r.correct)).toEqual([8, 6]);
    const capped = [rec(1, 1), rec(2, 2), rec(3, 3)].reduce(
      (acc, r) => pushRecord(acc, r, 2),
      [] as ChallengeRecord[],
    );
    expect(capped).toHaveLength(2);
    expect(capped[0].correct).toBe(3);
  });

  it('汇总：局数 / 最佳 / 平均答对', () => {
    const empty = summarize([]);
    expect(empty).toEqual({ games: 0, best: null, avgCorrect: 0 });

    const s = summarize([rec(1, 6), rec(2, 9), rec(3, 8)]);
    expect(s.games).toBe(3);
    expect(s.best?.correct).toBe(9);
    expect(s.avgCorrect).toBe(7.7);
  });
});
