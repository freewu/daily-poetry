import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { attributionOf, linePreview } from '@/lib/format';
import { hidePunct } from '@/lib/punct';
import { localizePoem } from '@/lib/script';
import { scaled } from '@/lib/typography';
import type { Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';
import { useTypography } from '@/typography';

interface Props {
  poem: Poem;
  index?: number;
  right?: React.ReactNode;
}

/** 诗词库 / 收藏列表行 */
export function PoemRow({ poem: raw, index, right }: Props) {
  const { colors } = useTheme();
  const { script } = useScript();
  const { family, scale, punct } = useTypography();
  const poem = localizePoem(raw, script);
  const router = useRouter();
  const attr = attributionOf(poem);
  return (
    <Pressable
      testID={`poem-row-${poem.id}`}
      onPress={() =>
        router.push({ pathname: '/poem/[id]', params: { id: String(poem.id) } })
      }
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <View style={styles.titleRow}>
          {index != null ? (
            <Text style={[styles.index, { color: colors.faint }]}>{String(index).padStart(3, '0')}</Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              { color: colors.text, fontFamily: family, fontSize: scaled(16, scale) },
            ]}>
            {poem.title || poem.name}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.preview, { color: colors.sub, fontSize: scaled(13, scale) }]}>
          {attr ? `${attr} · ` : ''}
          {linePreview(punct === 'space' ? { ...poem, content: hidePunct(poem.content) } : poem)}
        </Text>
      </View>
      {right ?? (
        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  index: { fontSize: 12, fontVariant: ['tabular-nums'] },
  title: { fontSize: 16, fontWeight: '600' },
  preview: { fontSize: 13, marginTop: 3 },
});
