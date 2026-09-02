import { StyleSheet, Text, View } from 'react-native';

import { PoemLines } from '@/components/poem-lines';
import { attributionOf, sourceOf } from '@/lib/format';
import type { Poem } from '@/lib/types';
import { useTheme } from '@/theme';

/** 诗词卡片：体裁章 · 题目 · 作者 · 正文 · 出处 */
export function PoemCard({ poem }: { poem: Poem }) {
  const { colors } = useTheme();
  const attr = attributionOf(poem);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}>
      <View style={styles.chipRow}>
        <Text style={[styles.chip, { backgroundColor: colors.soft, color: colors.softText }]}>
          {poem.kind}
        </Text>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{poem.title || poem.name}</Text>
      {attr ? (
        <Text style={[styles.attr, { color: colors.sub }]}>{attr}</Text>
      ) : null}
      <View style={[styles.rule, { backgroundColor: colors.line }]} />
      <PoemLines poem={poem} color={colors.text} />
      <Text style={[styles.src, { color: colors.faint }]}>{sourceOf(poem)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
  },
  chipRow: { flexDirection: 'row', marginBottom: 14 },
  chip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9,
    overflow: 'hidden',
  },
  title: { fontSize: 27, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  attr: { fontSize: 14, textAlign: 'center', marginTop: 10, letterSpacing: 1 },
  rule: { height: 1, width: 90, alignSelf: 'center', marginVertical: 18 },
  src: { fontSize: 12, marginTop: 22, textAlign: 'center' },
});
