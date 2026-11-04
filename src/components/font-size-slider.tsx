import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { BODY_STEP, MAX_BODY, MIN_BODY } from '@/lib/typography';
import { useTheme } from '@/theme';

interface Props {
  /** 当前正文字号（px） */
  value: number;
  /** 拖动中：只更新界面，别写库 */
  onChange: (n: number) => void;
  /** 松手：这时候才落库 */
  onCommit?: (n: number) => void;
  testID?: string;
}

/**
 * 字号滑块：拖的同时就能看到预览变化，松手才写 meta（不然一次拖动几十次写库）。
 * 两端用大小两个「A」表示方向，右边跟着当前字号，比四档按钮直观。
 */
export function FontSizeSlider({ value, onChange, onCommit, testID = 'font-size-slider' }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.edge, { color: colors.faint, fontSize: 12 }]}>A</Text>
      <Slider
        testID={testID}
        accessibilityLabel="正文字号"
        style={styles.slider}
        minimumValue={MIN_BODY}
        maximumValue={MAX_BODY}
        step={BODY_STEP}
        value={value}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.accent}
        onValueChange={(n: number) => onChange(Math.round(n))}
        onSlidingComplete={(n: number) => (onCommit ?? onChange)(Math.round(n))}
      />
      <Text style={[styles.edge, { color: colors.faint, fontSize: 20 }]}>A</Text>
      <Text testID={`${testID}-value`} style={[styles.value, { color: colors.sub }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 6 },
  slider: { flex: 1, height: 40 },
  edge: { fontWeight: '600' },
  value: { fontSize: 13, minWidth: 22, textAlign: 'right', fontWeight: '600' },
});
