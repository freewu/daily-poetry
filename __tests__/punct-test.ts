// 标点显示：保留原文 / 换成空格（空白断句）。
// 换行是「原文一行」的边界（竖排列数靠它算），所以隐藏标点时只能动标点，不能动换行。

import { DEFAULT_PUNCT, hidePunct, isPunctKey, PUNCT_OPTS } from '@/lib/punct';

describe('PUNCT_OPTS', () => {
  it('两档，默认保留原文标点', () => {
    expect(PUNCT_OPTS.map((o) => o.key)).toEqual(['keep', 'space']);
    expect(PUNCT_OPTS.every((o) => o.label && o.hint)).toBe(true);
    expect(DEFAULT_PUNCT).toBe('keep');
  });
});

describe('isPunctKey', () => {
  it('只认 keep / space', () => {
    expect(isPunctKey('keep')).toBe(true);
    expect(isPunctKey('space')).toBe(true);
  });

  it('库里的脏值一律拒绝（保持默认）', () => {
    expect(isPunctKey('drop')).toBe(false);
    expect(isPunctKey('')).toBe(false);
    expect(isPunctKey(null)).toBe(false);
    expect(isPunctKey(undefined)).toBe(false);
    expect(isPunctKey(0)).toBe(false);
  });
});

describe('hidePunct', () => {
  it('逗号句号换成空格，不是直接删掉（否则两句黏在一起）', () => {
    expect(hidePunct('床前明月光，疑是地上霜。')).toBe('床前明月光 疑是地上霜');
  });

  it('顿号、问叹号、引号书名号、破折号省略号一并抹掉', () => {
    expect(hidePunct('“春眠不觉晓”，处处闻啼鸟！')).toBe('春眠不觉晓 处处闻啼鸟');
    expect(hidePunct('《静夜思》——李白……')).toBe('静夜思 李白');
    expect(hidePunct('东、西；南：北？')).toBe('东 西 南 北');
  });

  it('保留换行：原文一行 = 一行（竖排的列数不变）', () => {
    expect(hidePunct('床前明月光，\n疑是地上霜。')).toBe('床前明月光\n疑是地上霜');
  });

  it('连续空白压成一个，行首行尾不留空格', () => {
    expect(hidePunct('  ，床前  明月光；  ')).toBe('床前 明月光');
    // 语料是 \r\n 换行时，trim 顺手把 \r 也带走
    expect(hidePunct('床前明月光，\r\n疑是地上霜。')).toBe('床前明月光\n疑是地上霜');
  });

  it('本来就没标点的正文原样返回（不产生多余空白）', () => {
    expect(hidePunct('床前明月光\n疑是地上霜')).toBe('床前明月光\n疑是地上霜');
  });

  it('半角西文标点也算', () => {
    expect(hidePunct('Hello, world!')).toBe('Hello world');
  });

  it('空串仍是空串', () => {
    expect(hidePunct('')).toBe('');
  });
});
