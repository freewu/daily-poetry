import { StyleSheet, Text, View } from 'react-native';

import { PoemLines } from '@/components/poem-lines';
import { CARD_BRAND, CARD_MARK, cardStamp } from '@/lib/card';
import { attributionOf, sourceOf } from '@/lib/format';
import { localizePoem } from '@/lib/script';
import type { Poem, PunctKey, Script } from '@/lib/types';
import { useScript } from '@/script';
import { useTypography } from '@/typography';

/**
 * 分享卡片的配色是固定的（不跟夜间模式走）：导出的图会被存进相册、发到
 * 别处，一张浅色笺纸在哪儿都好看，也不吃系统主题的亏。
 */
const PAPER = '#F6EFDC';
const INK = '#241F1A';
const INK_SUB = '#6B5F4E';
const INK_FAINT = '#A08F72';
const LINE = '#DCCDA9';
const ACCENT = '#A93226';

/** 卡片默认正文字号（卡片页可以用滑块改，导出图跟着走） */
export const CARD_BODY = 18;

interface Props {
  poem: Poem;
  /** 每日一诗的那天，印在卡片底部；不传就只印签名 */
  date?: string;
  /** 卡片宽度（按屏幕宽度算，导出即物理像素） */
  width: number;
  /** 正文字号；不传用卡片默认 18（不跟阅读字号，避免版面跳） */
  bodySize?: number;
  /** 简繁取字；不传跟设置 */
  script?: Script;
  /** 标点：保留 / 换成空格；不传跟设置 */
  punct?: PunctKey;
  testID?: string;
}

/**
 * 可保存的诗词卡片：笺纸底 + 双线框，题目 / 作者 / 正文 / 出处 + 日期戳。
 * 字族跟随设置；正文字号 / 简繁 / 标点可以在卡片页现场改（不传就用设置里的），
 * 排版固定横排（竖排长诗塞不进方寸）。
 */
export function ShareCard({
  poem: raw,
  date,
  width,
  bodySize,
  script: forceScript,
  punct: forcePunct,
  testID,
}: Props) {
  const { script: prefScript } = useScript();
  const { family } = useTypography();
  const script = forceScript ?? prefScript;
  const poem = localizePoem(raw, script);
  const size = bodySize ?? CARD_BODY;
  const attr = attributionOf(poem);
  const stamp = cardStamp(date);
  // 题目 / 作者按正文等比走：正文拉大时标题不至于显得没长
  const titleSize = Math.round(size * 1.4);
  const attrSize = Math.round(size * 0.72);

  return (
    <View testID={testID} style={[styles.card, { width, backgroundColor: PAPER }]}>
      <View style={[styles.frame, { borderColor: LINE }]}>
        <Text style={[styles.brand, { color: INK_FAINT }]}>{CARD_MARK}</Text>
        <Text style={[styles.chip, { borderColor: LINE, color: INK_SUB }]}>{poem.kind}</Text>
        <Text style={[styles.title, { color: INK, fontFamily: family, fontSize: titleSize }]}>
          {poem.title || poem.name}
        </Text>
        {attr ? (
          <Text style={[styles.attr, { color: INK_SUB, fontSize: attrSize }]}>{attr}</Text>
        ) : null}

        <View style={[styles.rule, { backgroundColor: ACCENT }]} />

        <PoemLines
          poem={poem}
          color={INK}
          fontSize={size}
          vertical={false}
          {...(forcePunct ? { punct: forcePunct } : null)}
        />

        <Text style={[styles.src, { color: INK_FAINT }]}>{sourceOf(poem)}</Text>
        <View style={[styles.footRule, { backgroundColor: LINE }]} />
        <Text style={[styles.stamp, { color: INK_SUB }]}>
          {stamp ? `${CARD_BRAND} · ${stamp}` : CARD_BRAND}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 6, padding: 10 },
  frame: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20 },
  // 抬头从 4 个字变成「每日诗词 APP」，字距跟着收一点，窄屏也排得下
  brand: { fontSize: 11, letterSpacing: 2, textAlign: 'center' },
  chip: {
    alignSelf: 'center',
    marginTop: 14,
    fontSize: 11,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  title: {
    marginTop: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 3,
  },
  attr: { marginTop: 10, textAlign: 'center', letterSpacing: 1 },
  rule: { height: 2, width: 46, alignSelf: 'center', marginTop: 16, marginBottom: 18, opacity: 0.8 },
  src: { marginTop: 24, fontSize: 11, textAlign: 'center', letterSpacing: 0.5 },
  footRule: { height: 1, marginTop: 16, marginBottom: 12, opacity: 0.9 },
  stamp: { fontSize: 11, textAlign: 'center', letterSpacing: 2 },
});
