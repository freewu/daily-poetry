import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PoemRow } from '@/components/poem-row';
import { ScreenBar } from '@/components/screen-bar';
import { ANONYMOUS } from '@/lib/authors';
import { getCollection, poemsOfAuthor } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta, Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 一位作者在某个集子里的作品（从作者统计页点名字进来）。
 * 名字走两道：简体用 `name`，繁体用 `tw`，都空着就是语料里没署名 → 「佚名」。
 */
export default function AuthorScreen() {
  const { name, coll, tw } = useLocalSearchParams<{ name?: string; coll?: string; tw?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [poems, setPoems] = useState<Poem[]>([]);

  const author = name ?? '';
  const collection = coll ?? '';

  useEffect(() => {
    let alive = true;
    getCollection(db, collection)
      .then((m) => alive && m && setMeta(m))
      .catch(() => {});
    poemsOfAuthor(db, collection, author)
      .then((ps) => alive && setPoems(ps))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, collection, author]);

  const book = meta ? localizeCollection(meta, script) : null;
  const who = (script === 'tw' ? (tw ?? '') || author : author) || ANONYMOUS;
  const subtitle = book ? `${book.name} · 共 ${poems.length} 首` : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title={who} />
      <FlatList
        data={poems}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => <PoemRow poem={item} index={index + 1} />}
        ListHeaderComponent={
          subtitle ? (
            <View style={styles.subhead}>
              <Text testID="author-sub" style={[styles.sub, { color: colors.sub }]}>
                {subtitle}
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.line }]} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={[styles.missing, { color: colors.faint }]}>这位作者的作品没找到</Text>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  subhead: { paddingHorizontal: 20, paddingTop: 4 },
  sub: { fontSize: 12, letterSpacing: 1 },
  rule: { height: 1, marginTop: 10, marginBottom: 2 },
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
