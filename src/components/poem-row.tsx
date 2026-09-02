import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { attributionOf, linePreview } from '@/lib/format';
import type { Poem } from '@/lib/types';
import { useTheme } from '@/theme';

interface Props {
  poem: Poem;
  index?: number;
  right?: React.ReactNode;
}

/** 诗词库 / 收藏列表行 */
export function PoemRow({ poem, index, right }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const attr = attributionOf(poem);
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/poem/[id]', params: { id: String(poem.id) } })
      }
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <View style={styles.titleRow}>
          {index != null ? (
            <Text style={[styles.index, { color: colors.faint }]}>{String(index).padStart(3, '0')}</Text>
          ) : null}
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {poem.title || poem.name}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.preview, { color: colors.sub }]}>
          {attr ? `${attr} · ` : ''}
          {linePreview(poem)}
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
