import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copyTextOf } from '@/lib/format';
import { getSetting, isFavorite, toggleFavorite } from '@/lib/db';
import { localizePoem } from '@/lib/script';
import { DEFAULT_RATE_KEY, isRateKey, rateOf } from '@/lib/tts';
import type { Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/** 朗读文本：题目、作者与正文拼成一段，句读规整 */
function utteranceOf(poem: Poem): string {
  const head = poem.author ? `${poem.title}，${poem.author}。` : `${poem.title}。`;
  const text = `${head}${poem.content}`.replace(/\s*\n+\s*/g, '。').replace(/[。！？；]{2,}/g, (m) => m[0]);
  return text.trim();
}

/** 底部操作栏：收藏 / 朗读 / 复制 / 存图 */
export function PoemActions({ poem: raw, onCard }: { poem: Poem; onCard?: () => void }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();
  // 朗读 / 复制也跟着简繁走
  const poem = localizePoem(raw, script);
  const [fav, setFav] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    isFavorite(db, poem.id).then((v) => alive && setFav(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, poem.id]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      Speech.stop();
    };
  }, []);

  const stopSpeaking = () => setSpeaking(false);

  const onSpeak = async () => {
    const speakingNow = await Speech.isSpeakingAsync();
    if (speakingNow) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    // 语速在设置里可调，每次朗读时现取，改完不用重启
    const rk = await getSetting(db, 'settings_tts_rate').catch(() => null);
    Speech.speak(utteranceOf(poem), {
      language: 'zh-CN',
      rate: rateOf(isRateKey(rk) ? rk : DEFAULT_RATE_KEY),
      onDone: stopSpeaking,
      onStopped: stopSpeaking,
      onError: stopSpeaking,
    });
  };

  const onFav = async () => {
    try {
      setFav(await toggleFavorite(db, poem.id));
    } catch {
      /* ignore */
    }
  };

  const onCopy = async () => {
    await Clipboard.setStringAsync(copyTextOf(poem));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={styles.bar}>
      <Pressable
        testID="act-favorite"
        accessibilityLabel={fav ? '取消收藏' : '收藏'}
        onPress={onFav}
        style={({ pressed }) => [
          styles.btn,
          fav ? { backgroundColor: colors.accent } : { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
          pressed && styles.pressed,
        ]}>
        <Ionicons
          name={fav ? 'heart' : 'heart-outline'}
          size={19}
          color={fav ? colors.onAccent : colors.accent}
        />
        <Text style={{ color: fav ? colors.onAccent : colors.text, fontSize: 15, fontWeight: '600' }}>
          {fav ? '已收藏' : '收藏'}
        </Text>
      </Pressable>

      <Pressable
        testID="act-speak"
        accessibilityLabel={speaking ? '停止朗读' : '朗读'}
        onPress={onSpeak}
        style={({ pressed }) => [
          styles.btn,
          speaking
            ? { backgroundColor: colors.accent }
            : { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
          pressed && styles.pressed,
        ]}>
        <Ionicons
          name={speaking ? 'stop-circle' : 'volume-high-outline'}
          size={19}
          color={speaking ? colors.onAccent : colors.text}
        />
        <Text style={{ color: speaking ? colors.onAccent : colors.text, fontSize: 15, fontWeight: '600' }}>
          {speaking ? '停止' : '朗读'}
        </Text>
      </Pressable>

      <Pressable
        testID="act-copy"
        accessibilityLabel="复制全文"
        onPress={onCopy}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
          pressed && styles.pressed,
        ]}>
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={19}
          color={copied ? colors.accent : colors.text}
        />
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
          {copied ? '已复制' : '复制'}
        </Text>
      </Pressable>

      {onCard ? (
        <Pressable
          testID="act-card"
          accessibilityLabel="生成卡片"
          onPress={onCard}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="image-outline" size={19} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>存图</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.6 },
});
