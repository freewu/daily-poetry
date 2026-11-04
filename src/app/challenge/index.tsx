import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBar } from '@/components/screen-bar';
import {
  CHALLENGE_MIN_POOL,
  CHALLENGE_SIZE,
  formatDuration,
  formatStamp,
  summarize,
  type ChallengeRecord,
} from '@/lib/challenge';
import {
  CHALLENGE_FAVORITES,
  favoriteCount,
  listCollections,
  challengeLog,
} from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

interface PoolOpt {
  id: string;
  name: string;
  kind: string;
  count: number;
}

/** 战绩里显示的最近几局 */
const RECENT = 5;

/**
 * 挑战入口页：挑一个来源（收藏 / 某个集子）就能开局。
 * 出题、判分、计时的活都在 `lib/challenge.ts` 与 `challenge/[pool].tsx` 里。
 */
export default function ChallengeSetupScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { script } = useScript();
  const insets = useSafeAreaInsets();

  const [pools, setPools] = useState<PoolOpt[] | null>(null);
  const [log, setLog] = useState<ChallengeRecord[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([listCollections(db), favoriteCount(db), challengeLog(db)])
        .then(([colls, favs, records]) => {
          if (!alive) return;
          const opts = [
            { id: CHALLENGE_FAVORITES, name: '我的收藏', kind: '收藏', count: favs },
            ...colls
              .map((c: CollectionMeta) => localizeCollection(c, script))
              .map((c) => ({ id: c.id, name: c.name, kind: c.kind, count: c.count })),
          ];
          setPools(opts);
          setLog(records);
          // 默认选第一个够出题的来源：收藏够就用收藏，否则退回第一个集子
          setPicked((prev) => prev ?? opts.find((p) => p.count >= CHALLENGE_MIN_POOL)?.id ?? null);
        })
        .catch(() => alive && setPools([]));
      return () => {
        alive = false;
      };
    }, [db, script]),
  );

  const list = pools ?? [];
  const pool = list.find((p) => p.id === picked) ?? null;
  const enough = !!pool && pool.count >= CHALLENGE_MIN_POOL;
  const stat = summarize(log);

  const start = () => {
    if (!pool || !enough) return;
    router.push({ pathname: '/challenge/[pool]', params: { pool: pool.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title="诗词挑战" />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>十题填空</Text>
          <Text style={[styles.cardBody, { color: colors.sub }]}>
            从所选来源里抽几首，挖掉其中一句，
            {'\n'}四选一补全。答错不扣分，答完即出结果。
          </Text>
          <View style={styles.ranks}>
            {[
              { label: '及格', at: '6 / 10', color: colors.sub },
              { label: '优秀', at: '8 / 10', color: colors.accent },
              { label: '诗仙下凡', at: '10 / 10', color: colors.accent },
            ].map((r) => (
              <View key={r.label} style={styles.rankItem}>
                <Text style={[styles.rankLabel, { color: r.color }]}>{r.label}</Text>
                <Text style={[styles.rankAt, { color: colors.faint }]}>{r.at}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.section, { color: colors.sub }]}>题目来源</Text>
        {list.map((p) => {
          const sel = p.id === picked;
          const ok = p.count >= CHALLENGE_MIN_POOL;
          return (
            <Pressable
              key={p.id}
              testID={`challenge-pool-${p.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled: !ok }}
              onPress={() => ok && setPicked(p.id)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: sel ? colors.accent : colors.line,
                  backgroundColor: sel ? colors.soft : colors.card,
                  opacity: pressed ? 0.7 : ok ? 1 : 0.45,
                },
              ]}>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowName, { color: sel ? colors.softText : colors.text }]}>
                  {p.name}
                </Text>
                <Text style={[styles.rowSub, { color: colors.faint }]}>
                  {ok ? `${p.kind} · ${p.count} 首` : `${p.count} 首 · 不够 ${CHALLENGE_MIN_POOL} 首，出不了题`}
                </Text>
              </View>
              {sel ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
            </Pressable>
          );
        })}

        <Text style={[styles.section, { color: colors.sub }]}>战绩</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {stat.games === 0 ? (
            <Text testID="challenge-log-empty" style={[styles.empty, { color: colors.faint }]}>
              还没打过。开局后这里记下用时、答对几题和参与时间。
            </Text>
          ) : (
            <>
              <View testID="challenge-summary" style={styles.summary}>
                <Text style={[styles.summaryMain, { color: colors.text }]}>{stat.games}</Text>
                <Text style={[styles.summaryLabel, { color: colors.sub }]}>局</Text>
                <View style={[styles.dot, { backgroundColor: colors.line }]} />
                <Text style={[styles.summaryMain, { color: colors.accent }]}>
                  {stat.best?.correct ?? 0}/{stat.best?.total ?? CHALLENGE_SIZE}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.sub }]}>最佳</Text>
                <View style={[styles.dot, { backgroundColor: colors.line }]} />
                <Text style={[styles.summaryMain, { color: colors.text }]}>{stat.avgCorrect}</Text>
                <Text style={[styles.summaryLabel, { color: colors.sub }]}>平均答对</Text>
              </View>
              {log.slice(0, RECENT).map((r, i) => (
                <View key={`${r.at}-${i}`} testID="challenge-log-row" style={[styles.logRow, { borderTopColor: colors.line }]}>
                  <Text testID="challenge-log-score" style={[styles.logScore, { color: colors.text }]}>
                    {r.correct}/{r.total}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.logPool, { color: colors.sub }]}>
                      {r.poolName}
                    </Text>
                    <Text style={[styles.logAt, { color: colors.faint }]}>
                      {formatStamp(r.at)} · 用时 {formatDuration(r.ms)}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, backgroundColor: colors.bg, borderTopColor: colors.line },
        ]}>
        <Pressable
          testID="challenge-start"
          accessibilityRole="button"
          accessibilityState={{ disabled: !enough }}
          disabled={!enough}
          onPress={start}
          style={({ pressed }) => [
            styles.start,
            {
              backgroundColor: enough ? colors.accent : colors.line,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Text style={[styles.startText, { color: enough ? colors.onAccent : colors.faint }]}>
            {enough ? `开始挑战 · ${pool.count >= CHALLENGE_SIZE ? CHALLENGE_SIZE : pool.count} 题` : '选一个来源'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  cardBody: { fontSize: 13, lineHeight: 21, marginTop: 8 },
  ranks: { flexDirection: 'row', marginTop: 14, gap: 18 },
  rankItem: { alignItems: 'flex-start' },
  rankLabel: { fontSize: 13, fontWeight: '700' },
  rankAt: { fontSize: 11, marginTop: 3 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 22, marginBottom: 8, marginHorizontal: 18 },
  row: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 4 },
  empty: { fontSize: 13, lineHeight: 21 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  summaryMain: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginRight: 6 },
  dot: { width: 1, height: 14, marginHorizontal: 6, alignSelf: 'center' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  logScore: { fontSize: 15, fontWeight: '700', minWidth: 42 },
  logPool: { fontSize: 13 },
  logAt: { fontSize: 11, marginTop: 3 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  start: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
