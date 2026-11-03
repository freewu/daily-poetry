import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { ScreenBar } from '@/components/screen-bar';
import { ShareCard } from '@/components/share-card';
import { cardFileName } from '@/lib/card';
import { saveImageToLibrary } from '@/lib/card-save';
import { getPoem } from '@/lib/db';
import type { Poem } from '@/lib/types';
import { useTheme } from '@/theme';

type Phase = 'idle' | 'saving' | 'saved' | 'denied' | 'failed';

const HINTS: Record<Exclude<Phase, 'idle' | 'saving'>, string> = {
  saved: '已保存到相册「每日诗词」',
  denied: '没有相册权限，去系统设置里允许后再试',
  failed: '保存失败，请再试一次',
};

/**
 * 诗词卡片：把一首诗排成一张笺纸，截图后存进相册。
 * 带 ?date= 时是「每日一诗」，底部会印上那天的日期。
 */
export default function CardScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [poem, setPoem] = useState<Poem | null>(null);
  const [missing, setMissing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const shot = useRef<View>(null);

  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;

  useEffect(() => {
    let alive = true;
    const pid = Number(params.id);
    const load =
      Number.isFinite(pid) && pid > 0 ? getPoem(db, pid) : Promise.resolve(null);
    load
      .then((p) => {
        if (!alive) return;
        if (p) setPoem(p);
        else setMissing(true);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [db, params.id]);

  const onSave = async () => {
    if (!poem || phase === 'saving') return;
    setPhase('saving');
    try {
      const name = cardFileName(poem, date);
      const uri = await captureRef(shot, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        fileName: name,
      });
      // iOS 必须先授权；Android 10+ 写 MediaStore 不用权限，失败再要
      const result = await saveImageToLibrary(uri, { askFirst: Platform.OS === 'ios', name });
      setPhase(result);
    } catch {
      setPhase('failed');
    }
  };

  const cardWidth = Math.min(width - 48, 420);
  const busy = phase === 'saving';
  const label = busy ? '正在保存…' : phase === 'saved' ? '已保存到相册' : '保存到相册';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title="诗词卡片" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {poem ? (
          // collapsable={false}：避免 Android 把外层 View 拍平导致截不到
          <View ref={shot} collapsable={false} testID="card-shot">
            <ShareCard poem={poem} date={date} width={cardWidth} testID="share-card" />
          </View>
        ) : missing ? (
          <Text style={[styles.hint, { color: colors.faint }]}>未找到这首诗词</Text>
        ) : (
          <Text style={[styles.hint, { color: colors.sub }]}>正在排卡片…</Text>
        )}

        {phase !== 'idle' && phase !== 'saving' ? (
          <Text
            testID="card-result"
            style={[
              styles.result,
              { color: phase === 'saved' ? colors.accent : colors.sub },
            ]}>
            {HINTS[phase]}
          </Text>
        ) : null}
      </ScrollView>

      {poem ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 12) }}>
          <Pressable
            testID="card-save"
            accessibilityLabel="保存到相册"
            disabled={busy}
            onPress={onSave}
            style={({ pressed }) => [
              styles.save,
              { backgroundColor: colors.accent },
              (pressed || busy) && styles.pressed,
            ]}>
            <Ionicons
              name={phase === 'saved' ? 'checkmark-circle' : 'download-outline'}
              size={19}
              color={colors.onAccent}
            />
            <Text style={[styles.saveText, { color: colors.onAccent }]}>{label}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 32, alignItems: 'center' },
  hint: { marginTop: 90, fontSize: 14 },
  result: { marginTop: 16, fontSize: 13, textAlign: 'center' },
  save: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
