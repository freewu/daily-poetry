import { Platform } from 'react-native';

import type { FontKey, Layout, SizeKey } from './types';

/**
 * 正文字体 / 字号。
 *
 * 不打包字体文件：用系统自带的 CJK 字族（Android 的 serif 会落到 NotoSerifCJK，
 * iOS 有宋体与楷体）。Android 没有楷体，所以「楷体」只在 iOS 出现。
 */
export interface FontOpt {
  key: FontKey;
  label: string;
  hint: string;
  /** undefined = 跟随系统默认字体 */
  family?: string;
}

const ALL_FONTS: FontOpt[] = [
  {
    key: 'system',
    label: '系统',
    hint: '跟随系统字体（黑体 / 苹方），笔画均匀',
    family: undefined,
  },
  {
    key: 'song',
    label: '宋体',
    hint: '衬线体，横细竖粗、起收有顿，接近刻本',
    family: Platform.select({ ios: 'Songti SC', default: 'serif' }),
  },
  {
    key: 'kai',
    label: '楷体',
    hint: '楷书笔意，最接近手抄本（系统自带，仅 iOS）',
    family: Platform.select({ ios: 'Kaiti SC', default: 'serif' }),
  },
];

/** 当前平台可选的字体（Android 没有楷体） */
export function fontOptions(): FontOpt[] {
  return ALL_FONTS.filter((o) => o.key !== 'kai' || Platform.OS === 'ios');
}

export function familyOf(key: FontKey): string | undefined {
  return (ALL_FONTS.find((o) => o.key === key) ?? ALL_FONTS[0]).family;
}

/** 正文字号档位：倍率作用在 21 号基准上 */
export interface SizeOpt {
  key: SizeKey;
  label: string;
  scale: number;
  hint: string;
}

export const SIZE_OPTS: SizeOpt[] = [
  { key: 'sm', label: '小', scale: 0.9, hint: '正文字号 19，信息密度最高' },
  { key: 'md', label: '标准', scale: 1, hint: '正文字号 21，默认' },
  { key: 'lg', label: '大', scale: 1.15, hint: '正文字号 24，适合小屏长读' },
  { key: 'xl', label: '特大', scale: 1.3, hint: '正文字号 27，适合长辈阅读' },
];

/** 正文基准字号（未缩放） */
export const BASE_FONT_SIZE = 21;

export function scaleOf(key: SizeKey): number {
  return (SIZE_OPTS.find((o) => o.key === key) ?? SIZE_OPTS[1]).scale;
}

/** 排版档位：横排 / 竖排 */
export interface LayoutOpt {
  key: Layout;
  label: string;
  hint: string;
}

export const LAYOUT_OPTS: LayoutOpt[] = [
  { key: 'horizontal', label: '横排', hint: '自左向右横读，长句更好排' },
  { key: 'vertical', label: '竖排', hint: '自右向左竖读，仿古籍版式' },
];

export function isLayoutKey(v: string | null | undefined): v is Layout {
  return LAYOUT_OPTS.some((o) => o.key === v);
}

/**
 * 竖排用的「列」：原文一行 = 一列，空行丢掉。
 * RN 没有 writing-mode，只能把每列的字竖直堆叠后右起排开。
 */
export function columnsOf(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 一列的字竖直堆叠：逐字换行（Array.from 保证代理对不被拆开）。
 * 行内空白换成全角空格——竖排里没有「空格宽度」这回事，一个空位就得占一整格，
 * 「空白断句」换来的空格才不会消失（见 hidePunct）。
 */
export function toColumnText(line: string): string {
  return Array.from(line.trim().replace(/\s/g, '\u3000')).join('\n');
}

/** 按档位缩放一个字号，最小 11，避免小字看不清 */
export function scaled(size: number, scale: number): number {
  return Math.max(11, Math.round(size * scale));
}
