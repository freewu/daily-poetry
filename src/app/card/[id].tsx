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

import { FontSizeSlider } from '@/components/font-size-slider';
import { ScreenBar } from '@/components/screen-bar';
import { Segment } from '@/components/segment';
import { CARD_BODY, ShareCard } from '@/components/share-card';
import {
  CARD_PUNCT_KEY,
  CARD_SCRIPT_KEY,
  CARD_SIZE_KEY,
  cardBodyOf,
  cardFileName,
  cardPunctOf,
  cardScriptOf,
} from '@/lib/card';
import { saveImageToLibrary, shareImage } from '@/lib/card-save';
import { getPoem, getSetting, setSetting } from '@/lib/db';
import { clampBody } from '@/lib/typography';
import type { Poem, PunctKey, Script } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';
import { useTypography } from '@/typography';

type Phase = 'idle' | 'saving' | 'saved' | 'denied' | 'failed';

const HINTS: Record<Exclude<Phase, 'idle' | 'saving'>, string> = {
  saved: '已保存到相册「每日诗词」',
  denied: '没有相册权限，去系统设置里允许后再试',
  failed: '保存失败，请再试一次',
};

/** 卡片页的「空 / 符」：标签短一点，一排塞得下 */
const PUNCT_SHORT: { key: PunctKey; label: string }[] = [
  { key: 'keep', label: '符' },
  { key: 'space', label: '空' },
];

const SCRIPT_SHORT: { key: Script; label: string }[] = [
  { key: 'cn', label: '简' },
  { key: 'tw', label: '繁' },
];

/**
 * 诗词卡片：把一首诗排成一张笺纸，截图存进相册，然后弹系统分享面板。
 * 带 ?date= 时是「每日一诗」，底部会印上那天的日期。
 *
 * 卡片上的字号 / 简繁 / 标点可以在这里现场调，**下一张卡片沿用上次的选择**
 * （存在 meta 的 `settings_card_*` 里，见 lib/card.ts）。它们不是阅读设置：
 * 卡片版式是给人看图用的，跟正文字号、竖排、标点偏好互不影响。
 */
export default function CardScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { punct: prefPunct } = useTypography();
  const { script: prefScript } = useScript();

  const [poem, setPoem] = useState<Poem | null>(null);
  const [missing, setMissing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  // null = 还没选过（首次用卡片）→ 用默认值：卡片字号固定 18，简繁 / 标点跟设置
  const [size, setSize] = useState<number | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [punct, setPunct] = useState<PunctKey | null>(null);
  const shot = useRef<View>(null);

  const cardSize = size ?? CARD_BODY;
  const cardScript = script ?? prefScript;
  const cardPunct = punct ?? prefPunct;

  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;

  useEffect(() => {
    let alive = true;
    const pid = Number(params.id);
    // 诗和「上次用的字号 / 简繁 / 标点」一起等：省得卡片先按默认值闪一下再跳
    Promise.all([
      Number.isFinite(pid) && pid > 0 ? getPoem(db, pid) : Promise.resolve(null),
      getSetting(db, CARD_SIZE_KEY),
      getSetting(db, CARD_SCRIPT_KEY),
      getSetting(db, CARD_PUNCT_KEY),
    ])
      .then(([p, savedSize, savedScript, savedPunct]) => {
        if (!alive) return;
        if (p) setPoem(p);
        else setMissing(true);
        const s = cardBodyOf(savedSize);
        if (s != null) setSize(s);
        const sc = cardScriptOf(savedScript);
        if (sc) setScript(sc);
        const pu = cardPunctOf(savedPunct);
        if (pu) setPunct(pu);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [db, params.id]);

  // 三个开关：拖动时只改界面（一次拖动会触发几十遍），松手才落库
  const commitSize = (n: number) => {
    const px = clampBody(n);
    setSize(px);
    setSetting(db, CARD_SIZE_KEY, String(px)).catch(() => {});
  };
  const pickScript = (k: Script) => {
    setScript(k);
    setSetting(db, CARD_SCRIPT_KEY, k).catch(() => {});
  };
  const pickPunct = (k: PunctKey) => {
    setPunct(k);
    setSetting(db, CARD_PUNCT_KEY, k).catch(() => {});
  };

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
      // 存好就接着分享（「保存并分享」）；设备没有分享能力的话只保存
      if (result === 'saved') await shareImage(uri, { title: name });
    } catch {
      setPhase('failed');
    }
  };

  const cardWidth = Math.min(width - 48, 420);
  const busy = phase === 'saving';
  const label = busy ? '正在保存…' : phase === 'saved' ? '已保存' : '保存并分享';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title="诗词卡片" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {poem ? (
          // collapsable={false}：避免 Android 把外层 View 拍平导致截不到
          <View ref={shot} collapsable={false} testID="card-shot">
            <ShareCard
              poem={poem}
              date={date}
              width={cardWidth}
              bodySize={cardSize}
              script={cardScript}
              punct={cardPunct}
              testID="share-card"
            />
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
        <View
          style={[
            styles.panel,
            { borderTopColor: colors.line, backgroundColor: colors.bg },
          ]}>
          <View style={styles.panelRow}>
            <Text style={[styles.panelLabel, { color: colors.sub }]}>字号</Text>
            <FontSizeSlider
              testID="card-size"
              value={cardSize}
              onChange={(n) => setSize(n)}
              onCommit={commitSize}
            />
          </View>
          <View style={styles.panelRow}>
            <Text style={[styles.panelLabel, { color: colors.sub }]}>用字</Text>
            <View style={styles.grow}>
              <Segment
                compact
                testIDPrefix="card-script"
                options={SCRIPT_SHORT}
                value={cardScript}
                onChange={pickScript}
              />
            </View>
            <Text style={[styles.panelLabel, { color: colors.sub }]}>标点</Text>
            <View style={styles.grow}>
              <Segment
                compact
                testIDPrefix="card-punct"
                options={PUNCT_SHORT}
                value={cardPunct}
                onChange={pickPunct}
              />
            </View>
          </View>
        </View>
      ) : null}

      {poem ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 12) }}>
          <Pressable
            testID="card-save"
            accessibilityLabel="保存到相册并分享"
            disabled={busy}
            onPress={onSave}
            style={({ pressed }) => [
              styles.save,
              { backgroundColor: colors.accent },
              (pressed || busy) && styles.pressed,
            ]}>
            <Ionicons
              name={phase === 'saved' ? 'checkmark-circle' : 'share-outline'}
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
  panel: { borderTopWidth: 1, paddingTop: 4, paddingBottom: 10, gap: 2 },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  panelLabel: { fontSize: 12, letterSpacing: 1 },
  grow: { flex: 1 },
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
