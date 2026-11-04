// 阅读设置：字族 / 字号 / 朗读语速的纯函数
import { Platform } from 'react-native';

import {
  BASE_FONT_SIZE,
  bodyHint,
  bodySizeOf,
  clampBody,
  columnsOf,
  DEFAULT_BODY,
  familyOf,
  fontOptions,
  isLayoutKey,
  LAYOUT_OPTS,
  LEGACY_SIZE_SCALE,
  MAX_BODY,
  MIN_BODY,
  scaled,
  scaleOfBody,
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

describe('字号（滑块，存 px）', () => {
  it('范围 10–24，默认 21', () => {
    expect([MIN_BODY, MAX_BODY, DEFAULT_BODY]).toEqual([10, 24, 21]);
    expect(DEFAULT_BODY).toBe(BASE_FONT_SIZE);
  });

  it('clampBody 收在范围内并取整，NaN 回默认', () => {
    expect(clampBody(21)).toBe(21);
    expect(clampBody(9.9)).toBe(10);
    expect(clampBody(40)).toBe(24);
    expect(clampBody(22.4)).toBe(22);
    expect(clampBody(NaN)).toBe(DEFAULT_BODY);
  });

  it('读库：新值就是 px 数字，老的四档键换算过来', () => {
    expect(bodySizeOf('16')).toBe(16);
    expect(bodySizeOf(' 24 ')).toBe(24);
    expect(bodySizeOf('28')).toBe(MAX_BODY); // 超出新上限就收到 24
    expect(bodySizeOf('lg')).toBe(24); // 21 × 1.15
    expect(bodySizeOf('xl')).toBe(MAX_BODY); // 21 × 1.3 = 27.3，收到 24
    expect(bodySizeOf('sm')).toBe(clampBody(21 * LEGACY_SIZE_SCALE.sm));
    expect(bodySizeOf(null)).toBe(DEFAULT_BODY);
    expect(bodySizeOf('')).toBe(DEFAULT_BODY);
    expect(bodySizeOf('huge')).toBe(DEFAULT_BODY);
    expect(bodySizeOf('999')).toBe(MAX_BODY);
  });

  it('倍率按 21 号基准算，其余文字等比缩放', () => {
    expect(scaleOfBody(21)).toBe(1);
    expect(scaleOfBody(42)).toBeCloseTo(MAX_BODY / BASE_FONT_SIZE); // 先 clamp 到 24，再算
    expect(scaleOfBody(18)).toBeCloseTo(18 / 21);
    expect(scaled(BASE_FONT_SIZE, scaleOfBody(24))).toBe(24);
  });

  it('再小的字号也不会低于 9（下限要比正文字号 10 小，否则行内小字反超正文）', () => {
    expect(scaled(10, 0.5)).toBe(9);
    expect(scaled(13, 10 / 21)).toBeLessThan(MIN_BODY);
  });

  it('滑块下面那句话按档位变', () => {
    expect(bodyHint(11)).toContain('最多字');
    expect(bodyHint(16)).toContain('信息密度高');
    expect(bodyHint(21)).toContain('日常阅读');
    expect(bodyHint(24)).toContain('长辈');
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
