import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  clearFavorites,
  favoriteCount,
  getSetting,
  historyDays,
  setSetting,
} from '@/lib/db';
import type { PushPref, ThemeMode } from '@/lib/types';
import { useTheme } from '@/theme';

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'auto', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
];

const PUSH_OPTS: { key: PushPref; label: string; hint: string }[] = [
  { key: 'classic', label: '经典轮换', hint: '在 1396 首经典池中按日期轮换' },
  { key: 'occasion', label: '应景优先', hint: '恰逢节日 / 节气当天，先推应景之作' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [favCount, setFavCount] = useState(0);
  const [days, setDays] = useState(0);
  const [push, setPush] = useState<PushPref>('classic');
  const [meta, setMeta] = useState<{ dataset: string; poems: string; built: string }>({
    dataset: '',
    poems: '',
    built: '',
  });

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([
        favoriteCount(db),
        historyDays(db),
        getSetting(db, 'dataset'),
        getSetting(db, 'poem_count'),
        getSetting(db, 'built_at'),
        getSetting(db, 'settings_push'),
      ])
        .then(([f, d, ds, pc, ba, sp]) => {
          if (!alive) return;
          setFavCount(f);
          setDays(d);
          setPush(sp === 'occasion' ? 'occasion' : 'classic');
          setMeta({
            dataset: ds ?? '',
            poems: pc ?? '',
            built: ba ? new Date(ba).toLocaleString('zh-CN') : '',
          });
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const confirmClear = () => {
    Alert.alert('清空收藏', '将删除全部收藏，此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => clearFavorites(db).then(() => setFavCount(0)).catch(() => {}),
      },
    ]);
  };

  const datasetLabel = meta.dataset === 'full' ? '完整库（含全宋词、元曲等）' : meta.dataset === 'standard' ? '精选集' : '—';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Section label="每日推送">
          <View style={styles.segment}>
            {PUSH_OPTS.map((o) => {
              const sel = push === o.key;
              return (
                <Pressable
                  key={o.key}
                  testID={`push-${o.key}`}
                  onPress={() => {
                    setPush(o.key);
                    setSetting(db, 'settings_push', o.key).catch(() => {});
                  }}
                  style={[
                    styles.segBtn,
                    sel
                      ? { backgroundColor: colors.accent }
                      : { borderColor: colors.line, borderWidth: 1 },
                  ]}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: sel ? colors.onAccent : colors.sub,
                    }}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.faint }]}>
            {PUSH_OPTS.find((o) => o.key === push)?.hint}
          </Text>
        </Section>

        <Section label="外观">
          <View style={styles.segment}>
            {MODES.map((m) => {
              const sel = mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  testID={`theme-${m.key}`}
                  onPress={() => setMode(m.key)}
                  style={[
                    styles.segBtn,
                    sel
                      ? { backgroundColor: colors.accent }
                      : { borderColor: colors.line, borderWidth: 1 },
                  ]}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: sel ? colors.onAccent : colors.sub,
                    }}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section label="我的">
          <Row
            testID="settings-favorites"
            label="收藏的诗词"
            value={favCount ? `${favCount} 首` : '暂无'}
            onPress={() => router.push('/favorites')}
          />
          <Row label="累计读诗天数" value={`${days} 天`} />
        </Section>

        <Section label="数据">
          <Row label="语料范围" value={datasetLabel} />
          <Row label="收录诗词" value={meta.poems ? `${meta.poems} 首` : '—'} />
          <Row label="数据库构建" value={meta.built || '—'} />
          <Row label="清空收藏" value="" onPress={confirmClear} danger />
        </Section>

        <Section label="关于">
          <Text style={[styles.about, { color: colors.sub }]}>
            每日诗词 v{Constants.expoConfig?.version ?? '1.0.0'} · 一款“每日一诗”小应用。
            {'\n\n'}语料整理自 GitHub 开源项目 chinese-poetry（唐诗三百首、千家诗、诗经、楚辞、花间集、南唐词及全宋词、元曲等），繁体文本已按大陆简体转写（OpenCC）。
            {'\n\n'}每日推送算法与日期一一对应、可复现：同一日期，无论何时打开，都会遇见同一首诗。
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.faint }]}>{label}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  testID,
  label,
  value,
  onPress,
  danger,
}: {
  testID?: string;
  label: string;
  value: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && { opacity: 0.55 },
      ]}>
      <Text style={[styles.rowLabel, danger ? { color: colors.accent } : { color: colors.text }]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: colors.sub }]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.faint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, marginLeft: 6, letterSpacing: 1 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 46,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 13, textAlign: 'right' },
  segment: { flexDirection: 'row', gap: 8, padding: 10 },
  hint: { fontSize: 12, paddingHorizontal: 14, paddingTop: 0, paddingBottom: 12, lineHeight: 18 },
  segBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  about: { fontSize: 13, lineHeight: 22, padding: 16 },
});
