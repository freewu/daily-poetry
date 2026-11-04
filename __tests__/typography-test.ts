// 阅读设置：字族 / 字号 / 朗读语速的纯函数
import { Platform } from 'react-native';

import {
  BASE_FONT_SIZE,
  columnsOf,
  familyOf,
  fontOptions,
  isLayoutKey,
  LAYOUT_OPTS,
  scaled,
  scaleOf,
  SIZE_OPTS,
  toColumnText,
} from '@/lib/typography';
import { DEFAULT_RATE_KEY, isRateKey, rateOf, RATE_OPTS, SPEECH_SAMPLE } from '@/lib/tts';

describe('字族', () => {
  it('系统字体不给 fontFamily（跟随系统默认）', () => {
    expect(familyOf('system')).toBeUndefined();
  });

  it('宋体走衬线族（Android serif 会落到 NotoSerifCJK）', () => {
    expect(familyOf('song')).toBe(Platform.OS === 'ios' ? 'Songti SC' : 'serif');
  });

  it('Android 没有楷体，选项里就不出现', () => {
    const keys = fontOptions().map((o) => o.key);
    expect(keys).toContain('system');
    expect(keys).toContain('song');
    expect(keys.includes('kai')).toBe(Platform.OS === 'ios');
  });

  it('未知档位回退到系统字体', () => {
    expect(familyOf('nope' as never)).toBeUndefined();
  });
});

describe('字号', () => {
  it('四档：小 / 标准 / 大 / 特大', () => {
    expect(SIZE_OPTS.map((o) => o.key)).toEqual(['sm', 'md', 'lg', 'xl']);
  });

  it('标准档是 1 倍，档位越大倍率越大', () => {
    expect(scaleOf('md')).toBe(1);
    const scales = SIZE_OPTS.map((o) => o.scale);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
  });

  it('正文基准 21 号，缩放后取整', () => {
    expect(BASE_FONT_SIZE).toBe(21);
    expect(scaled(BASE_FONT_SIZE, scaleOf('md'))).toBe(21);
    expect(scaled(BASE_FONT_SIZE, scaleOf('xl'))).toBe(27);
  });

  it('再小的字号也不会低于 11', () => {
    expect(scaled(10, 0.5)).toBe(11);
  });

  it('未知档位回退标准', () => {
    expect(scaleOf('huge' as never)).toBe(1);
  });
});

describe('朗读语速', () => {
  it('三档，标准 = 0.9 倍', () => {
    expect(RATE_OPTS.map((o) => o.key)).toEqual(['slow', 'normal', 'fast']);
    expect(rateOf('normal')).toBe(0.9);
    expect(DEFAULT_RATE_KEY).toBe('normal');
  });

  it('慢 < 标准 < 快', () => {
    expect(rateOf('slow')).toBeLessThan(rateOf('normal'));
    expect(rateOf('normal')).toBeLessThan(rateOf('fast'));
  });

  it('只认已知档位（库里的脏值要回退默认）', () => {
    expect(isRateKey('slow')).toBe(true);
    expect(isRateKey('turbo')).toBe(false);
    expect(isRateKey(null)).toBe(false);
    expect(rateOf('turbo' as never)).toBe(0.9);
  });

  it('试听句子是完整的诗句', () => {
    expect(SPEECH_SAMPLE).toBe('床前明月光，疑是地上霜。');
  });
});

describe('排版（横排 / 竖排）', () => {
  it('两档：横排 / 竖排', () => {
    expect(LAYOUT_OPTS.map((o) => o.key)).toEqual(['horizontal', 'vertical']);
    expect(isLayoutKey('vertical')).toBe(true);
    expect(isLayoutKey('diagonal')).toBe(false);
    expect(isLayoutKey(null)).toBe(false);
  });

  it('竖排按原文换行拆列，空行丢掉', () => {
    expect(columnsOf('床前明月光\n疑是地上霜')).toEqual(['床前明月光', '疑是地上霜']);
    expect(columnsOf('床前明月光\n\n疑是地上霜\n  ')).toEqual(['床前明月光', '疑是地上霜']);
    expect(columnsOf('')).toEqual([]);
  });

  it('一列的字逐字换行，标点也各占一格', () => {
    expect(toColumnText('床前明月光，')).toBe('床\n前\n明\n月\n光\n，');
  });

  it('行内空白占满一格：竖排里没有「空格宽度」，空位要跟字一样高', () => {
    expect(toColumnText(' 床 前 ')).toBe('床\n\u3000\n前');
    expect(toColumnText('床前 明月光')).toBe('床\n前\n\u3000\n明\n月\n光');
  });

  it('不把代理对拆开', () => {
    expect(toColumnText('𠀋月')).toBe('𠀋\n月');
  });
});
