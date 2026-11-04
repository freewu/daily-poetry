// 作者统计的纯函数：首字母 / 同字母内排序 / 分组（pinyin-pro 现算，不落库）
import {
  ANONYMOUS,
  authorLabel,
  compareLetters,
  groupAuthors,
  initialOf,
  isAnonymousName,
  letterLabel,
  OTHER_LETTER,
  sortKeyOf,
  type AuthorStat,
} from '@/lib/authors';

const row = (name: string, count = 1, nameTw?: string): AuthorStat => ({ name, count, nameTw });

describe('姓首字母', () => {
  it('常见姓名各归各的字母', () => {
    expect(initialOf('李白')).toBe('L');
    expect(initialOf('杜甫')).toBe('D');
    expect(initialOf('苏轼')).toBe('S');
    expect(initialOf('王维')).toBe('W');
    expect(initialOf('欧阳修')).toBe('O');
  });

  it('多音字按姓氏念（曾 / 单 / 仇 / 查 / 乐）', () => {
    // 不按姓氏读的话「曾巩」会被排进 C、「单雄信」进 D
    expect(initialOf('曾巩')).toBe('Z');
    expect(initialOf('单雄信')).toBe('S');
    expect(initialOf('仇英')).toBe('Q');
    expect(initialOf('查慎行')).toBe('Z');
    expect(initialOf('乐雷发')).toBe('Y');
  });

  it('没署名 / 生僻到没有拼音的归「其他」', () => {
    expect(initialOf('')).toBe(OTHER_LETTER);
    expect(initialOf('   ')).toBe(OTHER_LETTER);
    // 「佚名」「无名氏」不是人名，别按拼音挤进 Y / W
    expect(initialOf('佚名')).toBe(OTHER_LETTER);
    expect(initialOf('无名氏')).toBe(OTHER_LETTER);
    // 𠀀 是扩展 B 里的死字，pinyin-pro 也拼不出来
    expect(initialOf('\u{20000}')).toBe(OTHER_LETTER);
  });

  it('拉丁字母写的名字直接用首字母', () => {
    expect(initialOf('li bai')).toBe('L');
    expect(initialOf('Anon')).toBe('A');
  });

  it('全拼小写，用于同字母内排序', () => {
    expect(sortKeyOf('李白')).toBe('li bai');
    // 佚名 / 无名氏垫底
    expect(sortKeyOf('') > 'z').toBe(true);
    expect(sortKeyOf('无名氏') > 'z').toBe(true);
  });

  it('认得出「佚名」这类假作者', () => {
    expect(isAnonymousName('')).toBe(true);
    expect(isAnonymousName('佚名')).toBe(true);
    expect(isAnonymousName('无名氏')).toBe(true);
    expect(isAnonymousName('李白')).toBe(false);
  });
});

describe('分组', () => {
  it('组间 A→Z、# 最后；组内作品多的在前，同数再按全拼', () => {
    const groups = groupAuthors([
      row('杜甫', 3),
      row('白居易', 2),
      row('', 5),
      row('李白', 4),
      row('王安石', 1),
      row('李商隐', 2),
    ]);
    expect(groups.map((g) => g.initial)).toEqual(['B', 'D', 'L', 'W', OTHER_LETTER]);
    // L 组：李白 4 首在前，李商隐 2 首在后
    expect(groups[2].data.map((r) => r.name)).toEqual(['李白', '李商隐']);
    expect(groups[1].data[0].count).toBe(3);
  });

  it('作品数一样多时才按全拼，不是反过来', () => {
    const groups = groupAuthors([
      row('李商隐', 2),
      row('李白', 2),
      row('刘禹锡', 9),
      row('陆游', 9),
    ]);
    // 同一字母下先比作品数（刘禹锡 9 = 陆游 9 → 按全拼 liu < lu），再比名字
    expect(groups[0].data.map((r) => r.name)).toEqual(['刘禹锡', '陆游', '李白', '李商隐']);
  });

  it('「其他」组也按作品数排（诗经那种全是佚名的集子）', () => {
    const groups = groupAuthors([row('无名氏', 2), row('', 300), row('佚名', 40)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].data.map((r) => r.name)).toEqual(['', '佚名', '无名氏']);
  });

  it('只有真的存在的字母分组（左侧索引不留空档）', () => {
    const groups = groupAuthors([row('李白'), row('杜甫')]);
    expect(groups.map((g) => g.initial)).toEqual(['D', 'L']);
  });

  it('空列表就是空分组', () => {
    expect(groupAuthors([])).toEqual([]);
  });

  it('compareLetters：A < Z < #', () => {
    expect(compareLetters('A', 'Z')).toBe(-1);
    expect(compareLetters('Z', OTHER_LETTER)).toBe(-1);
    expect(compareLetters(OTHER_LETTER, 'A')).toBe(1);
    expect(compareLetters('M', 'M')).toBe(0);
  });
});

describe('显示名', () => {
  it('简体用 name、繁體优先 nameTw，都没有就叫佚名', () => {
    const li: AuthorStat = { name: '李白', nameTw: '李白', count: 1 };
    expect(authorLabel(li, 'cn')).toBe('李白');
    expect(authorLabel(li, 'tw')).toBe('李白');

    const su: AuthorStat = { name: '苏轼', nameTw: '蘇軾', count: 1 };
    expect(authorLabel(su, 'tw')).toBe('蘇軾');
    expect(authorLabel(su, 'cn')).toBe('苏轼');

    expect(authorLabel(row(''), 'cn')).toBe(ANONYMOUS);
    expect(authorLabel({ name: '', nameTw: '', count: 2 }, 'tw')).toBe(ANONYMOUS);
  });

  it('分组标题把 # 写成「其他」', () => {
    expect(letterLabel('L')).toBe('L');
    expect(letterLabel(OTHER_LETTER)).toBe('其他');
  });
});
