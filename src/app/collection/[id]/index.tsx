import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PoemRow } from '@/components/poem-row';
import { ScreenBar } from '@/components/screen-bar';
import { getCollection, poemsOfCollection } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta, Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/** 一个集子的全部诗词（从作者统计页的「全部诗词」进来） */
export default function CollectionPoemsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [missing, setMissing] = useState(() => !id);

  useEffect(() => {
    const coll = id ?? '';
    let alive = true;
    getCollection(db, coll)
      .then((m) => {
        if (!alive) return;
        if (!m) {
          setMissing(true);
          return;
        }
        setMeta(m);
        poemsOfCollection(db, coll)
          .then((ps) => alive && setPoems(ps))
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, id]);

  const coll = meta ? localizeCollection(meta, script) : null;
  const title = coll?.name ?? '选集';
  const subtitle = coll ? `${coll.kind} · 共 ${poems.length} 首` : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title={title} />
      {missing ? (
        <Text style={[styles.missing, { color: colors.faint }]}>未找到该选集</Text>
      ) : (
        <FlatList
          data={poems}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item, index }) => <PoemRow poem={item} index={index + 1} />}
          ListHeaderComponent={
            subtitle ? (
              <View style={styles.subhead}>
                <Text style={[styles.sub, { color: colors.sub }]}>{subtitle}</Text>
                <View style={[styles.rule, { backgroundColor: colors.line }]} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subhead: { paddingHorizontal: 20, paddingTop: 4 },
  sub: { fontSize: 12, letterSpacing: 1 },
  rule: { height: 1, marginTop: 10, marginBottom: 2 },
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
