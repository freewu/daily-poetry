import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoemRow } from '@/components/poem-row';
import { listFavorites } from '@/lib/db';
import type { Poem } from '@/lib/types';
import { useTheme } from '@/theme';

export default function FavoritesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [poems, setPoems] = useState<Poem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listFavorites(db)
        .then((ps) => alive && setPoems(ps))
        .catch(() => alive && setPoems([]));
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const list = poems ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>收藏</Text>
          <Text style={[styles.sub, { color: colors.sub }]}>
            {list.length > 0 ? `已收藏 ${list.length} 首` : '把喜欢的诗词收进这里'}
          </Text>
        </View>
        <Pressable
          testID="challenge-entry"
          accessibilityRole="button"
          accessibilityLabel="诗词挑战"
          hitSlop={8}
          onPress={() => router.push('/challenge')}
          style={({ pressed }) => [
            styles.entry,
            { borderColor: colors.accent, opacity: pressed ? 0.55 : 1 },
          ]}>
          <Ionicons name="trophy-outline" size={14} color={colors.accent} />
          <Text style={[styles.entryText, { color: colors.accent }]}>挑战</Text>
        </Pressable>
      </View>
      {list.length === 0 ? (
        <View testID="favorites-empty" style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={44} color={colors.faint} />
          <Text style={[styles.empty, { color: colors.faint }]}>
            还没有收藏。在诗页点“收藏”，{'\n'}便可将它留在此处。
          </Text>
        </View>
      ) : (
        <FlatList
          testID="favorites-list"
          data={list}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item, index }) => <PoemRow poem={item} index={index + 1} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  entryText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  sub: { fontSize: 12, marginTop: 6 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  empty: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
