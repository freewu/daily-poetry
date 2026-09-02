import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copyTextOf } from '@/lib/format';
import { isFavorite, toggleFavorite } from '@/lib/db';
import type { Poem } from '@/lib/types';
import { useTheme } from '@/theme';

/** 底部操作栏：收藏 / 复制 */
export function PoemActions({ poem }: { poem: Poem }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [fav, setFav] = useState(false);
  const [copied, setCopied] = useState(false);
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
    };
  }, []);

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
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  pressed: { opacity: 0.6 },
});
