import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PoemRow } from '@/components/poem-row';
import { ScreenBar } from '@/components/screen-bar';
import { getCollection, poemsOfCipai } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta, Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 一个词牌在某个集子里的全部作品（从词牌统计页点进来）。
 * 名字走两道：简体用 `name`，繁体用 `tw`（词牌没有繁體列，是建表时从繁体题目里算的）。
 */
export default function CipaiPoemsScreen() {
  const { id, name, tw } = useLocalSearchParams<{ id?: string; name?: string; tw?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [poems, setPoems] = useState<Poem[]>([]);

  const cipai = name ?? '';
  const collection = id ?? '';

  useEffect(() => {
    let alive = true;
    getCollection(db, collection)
      .then((m) => alive && m && setMeta(m))
      .catch(() => {});
    poemsOfCipai(db, collection, cipai)
      .then((ps) => alive && setPoems(ps))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, collection, cipai]);

  const book = meta ? localizeCollection(meta, script) : null;
  const who = (script === 'tw' ? (tw ?? '') || cipai : cipai) || '词牌';
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
              <Text testID="cipai-sub" style={[styles.sub, { color: colors.sub }]}>
                {subtitle}
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.line }]} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={[styles.missing, { color: colors.faint }]}>这个词牌的作品没找到</Text>
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
