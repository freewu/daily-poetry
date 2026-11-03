import type { RateKey } from './types';

/**
 * 朗读语速。expo-speech 的 rate 是倍率：1.0 = 系统默认语速，
 * 中文用 1.0 偏快，所以「标准」取 0.9（与之前的固定值 0.88 手感一致）。
 */
export interface RateOpt {
  key: RateKey;
  label: string;
  rate: number;
  hint: string;
}

export const RATE_OPTS: RateOpt[] = [
  { key: 'slow', label: '慢', rate: 0.7, hint: '0.7× 语速，一句一句听得清' },
  { key: 'normal', label: '标准', rate: 0.9, hint: '0.9× 语速，接近吟诵节奏' },
  { key: 'fast', label: '快', rate: 1.2, hint: '1.2× 语速，赶时间用' },
];

export const DEFAULT_RATE_KEY: RateKey = 'normal';

export function isRateKey(v: string | null | undefined): v is RateKey {
  return RATE_OPTS.some((o) => o.key === v);
}

export function rateOf(key: RateKey): number {
  return (RATE_OPTS.find((o) => o.key === key) ?? RATE_OPTS[1]).rate;
}

/** 试听用的句子（也用于设置页预览） */
export const SPEECH_SAMPLE = '床前明月光，疑是地上霜。';
