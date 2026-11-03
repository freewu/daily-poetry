import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoemRow } from '@/components/poem-row';
import { listCollections, searchPoems } from '@/lib/db';
import type { CollectionMeta, Poem } from '@/lib/types';
import { useTheme } from '@/theme';

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cols, setCols] = useState<CollectionMeta[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Poem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listCollections(db).then(setCols).catch(() => {});
    }, [db]),
  );

  useEffect(() => {
    const kw = q.trim();
    if (!kw) return;
    let alive = true;
    searchPoems(db, kw).then((rs) => alive && setResults(rs)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, q]);

  const searching = q.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>诗词库</Text>
        <Text style={[styles.sub, { color: colors.sub }]}>经典与全藏 · 支持全文检索</Text>
      </View>

      <View
        style={[
          styles.search,
          { backgroundColor: colors.card, borderColor: colors.line },
        ]}>
        <Ionicons name="search" size={16} color={colors.faint} />
        <TextInput
          testID="search-input"
          value={q}
          onChangeText={setQ}
          placeholder="搜题目 / 作者 / 诗句…"
          placeholderTextColor={colors.faint}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        {q.length > 0 ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <FlatList
          key="search"
          testID="search-results"
          data={results ?? []}
          keyExtractor={(p) => String(p.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => <PoemRow poem={item} index={index + 1} />}
          ListHeaderComponent={
            <Text style={[styles.listHint, { color: colors.sub }]}>
              找到 {results?.length ?? 0} 首与「{q.trim()}」相关
            </Text>
          }
          ListEmptyComponent={
            <Text testID="search-empty" style={[styles.empty, { color: colors.faint }]}>
              没有找到相关诗词，换个词试试
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : (
        <FlatList
          key="grid"
          testID="collections"
          data={cols}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <CollectionCard coll={item} />}
        />
      )}
    </View>
  );
}

function CollectionCard({ coll }: { coll: CollectionMeta }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      testID={`collection-${coll.id}`}
      onPress={() =>
        router.push({ pathname: '/collection/[id]', params: { id: coll.id } })
      }
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Text style={[styles.kind, { backgroundColor: colors.soft, color: colors.softText }]}>
          {coll.kind}
        </Text>
        {coll.daily ? (
          <Text style={[styles.daily, { color: colors.accent }]}>每日精选</Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
        {coll.name}
      </Text>
      <Text style={[styles.count, { color: colors.sub }]}>共 {coll.count} 首</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  sub: { fontSize: 12, marginTop: 6, color: '#888' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  grid: { padding: 20, gap: 12, paddingBottom: 30 },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  kind: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  daily: { fontSize: 11, fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  count: { fontSize: 12 },
  listHint: { fontSize: 12, marginHorizontal: 20, marginVertical: 10 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14 },
});
