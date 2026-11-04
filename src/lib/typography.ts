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

/** 正文基准字号（未缩放） */
export const BASE_FONT_SIZE = 21;

/**
 * 字号现在是一根滑块：直接存正文 px（10–24，步长 1）。
 * 老版本存的是 sm|md|lg|xl 四档，读到就按下面的倍率换算过来，不丢设置。
 */
export const MIN_BODY = 10;
export const MAX_BODY = 24;
export const BODY_STEP = 1;
export const DEFAULT_BODY = BASE_FONT_SIZE;

/** 老版四档 → 倍率（只用于读旧库里的值） */
export const LEGACY_SIZE_SCALE: Record<SizeKey, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
  xl: 1.3,
};

export function clampBody(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BODY;
  return Math.min(MAX_BODY, Math.max(MIN_BODY, Math.round(n)));
}

/** meta 里的 settings_font_size → 正文 px：新值就是数字，老值是四档键 */
export function bodySizeOf(v: string | null | undefined): number {
  const raw = (v ?? '').trim();
  if (!raw) return DEFAULT_BODY;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return clampBody(n);
  const legacy = LEGACY_SIZE_SCALE[raw as SizeKey];
  return legacy ? clampBody(BASE_FONT_SIZE * legacy) : DEFAULT_BODY;
}

/** 滑块下方那句话：按当前字号说人话 */
export function bodyHint(n: number): string {
  const size = clampBody(n);
  if (size <= 13) return `正文 ${size} 号，一屏放得下最多字`;
  if (size <= 17) return `正文 ${size} 号，信息密度高，扫读快`;
  if (size <= 21) return `正文 ${size} 号，日常阅读最舒服`;
  return `正文 ${size} 号，适合长辈阅读`;
}

/** 字号倍率：列表行 / 题目等其余文字按它等比缩放 */
export function scaleOfBody(body: number): number {
  return clampBody(body) / BASE_FONT_SIZE;
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

/**
 * 按档位缩放一个字号，最小 9：字号下限是 10，缩放后的行内小字（首句 13 号那种）
 * 不能反而比正文还大 —— 下限卡在 11 就会这样（13 × 10/21 = 6.2 → 11 > 10）。
 */
export function scaled(size: number, scale: number): number {
  return Math.max(9, Math.round(size * scale));
}
