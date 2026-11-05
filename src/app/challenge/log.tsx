import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBar } from '@/components/screen-bar';
import {
  CHALLENGE_SIZE,
  formatDuration,
  formatStamp,
  summarize,
  type ChallengeRecord,
} from '@/lib/challenge';
import { challengeLog } from '@/lib/db';
import { useTheme } from '@/theme';

/**
 * 挑战战绩：上面一块汇总（局数 / 最佳 / 平均答对），下面一局一行。
 *
 * 数据只在 `meta.challenge_log` 里（`CHALLENGE_LOG_MAX = 20` 局，新的排最前），
 * 所以这页不做分页、也不建表。入口在挑战首页右上角。
 */
export default function ChallengeLogScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // null = 还没读完（别一进来就闪一下「还没打过」）
  const [log, setLog] = useState<ChallengeRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      challengeLog(db)
        .then((rows) => alive && setLog(rows))
        .catch(() => alive && setLog([]));
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const stat = summarize(log ?? []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title="战绩" />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {!log ? (
            <Text testID="challenge-log-loading" style={[styles.empty, { color: colors.faint }]}>
              正在读战绩…
            </Text>
          ) : stat.games === 0 ? (
            <Text testID="challenge-log-empty" style={[styles.empty, { color: colors.faint }]}>
              还没打过。开一局之后，这里会记下用时、答对几题和参与时间。
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
              {log.map((r, i) => (
                <View
                  key={`${r.at}-${i}`}
                  testID="challenge-log-row"
                  style={[styles.logRow, { borderTopColor: colors.line }]}>
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
  empty: { fontSize: 13, lineHeight: 21 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  summaryMain: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginRight: 6 },
  dot: { width: 1, height: 14, marginHorizontal: 6, alignSelf: 'center' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 10,
  },
  logScore: { fontSize: 15, fontWeight: '700', minWidth: 42 },
  logPool: { fontSize: 13 },
  logAt: { fontSize: 11, marginTop: 3 },
});
