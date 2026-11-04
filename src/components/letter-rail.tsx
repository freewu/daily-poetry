import { Pressable, StyleSheet, Text, View } from 'react-native';

import { letterLabel } from '@/lib/authors';
import { useTheme } from '@/theme';

interface Props {
  /** 只有真的有作者的字母才传进来（空字母不显示，免得点了没反应） */
  letters: string[];
  /** 当前滚到的字母，高亮用 */
  active?: string;
  onPick: (letter: string) => void;
}

/**
 * A–Z 快速索引条：贴在列表右侧（右手拇指够得着，也不压住作者名），点一下跳到对应分组。
 * 字母表按实际存在的分组生成，凑不满 26 个也不会留空档。
 */
export function LetterRail({ letters, active, onPick }: Props) {
  const { colors } = useTheme();
  if (letters.length === 0) return null;
  return (
    <View testID="letter-rail" style={styles.rail}>
      {letters.map((letter) => {
        const on = letter === active;
        return (
          <Pressable
            key={letter}
            testID={`letter-${letter}`}
            accessibilityRole="button"
            accessibilityLabel={`跳到 ${letterLabel(letter)}`}
            onPress={() => onPick(letter)}
            hitSlop={{ top: 2, bottom: 2, left: 10, right: 10 }}
            style={styles.slot}>
            <Text
              style={[
                styles.letter,
                { color: on ? colors.accent : colors.faint },
                on && styles.on,
              ]}>
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 24,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slot: { height: 16, justifyContent: 'center', alignItems: 'center' },
  letter: { fontSize: 10, fontWeight: '600', letterSpacing: 0 },
  on: { fontSize: 12, fontWeight: '800' },
});
