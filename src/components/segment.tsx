import { StyleSheet, Text, View, Pressable } from 'react-native';

import { useTheme } from '@/theme';

interface Props<T extends string> {
  /** testID 为 `${testIDPrefix}-${key}` */
  testIDPrefix: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  hint?: string;
  /** 紧凑版：设置页用默认，卡片页底部条用 compact（更矮、留白更小） */
  compact?: boolean;
}

/** 分段选择器：推送偏好 / 字体 / 简繁 / 标点 / 主题 / 卡片里的繁简与标点共用 */
export function Segment<T extends string>({
  testIDPrefix,
  options,
  value,
  onChange,
  hint,
  compact,
}: Props<T>) {
  const { colors } = useTheme();
  return (
    <>
      <View style={[styles.segment, compact && styles.segmentCompact]}>
        {options.map((o) => {
          const sel = value === o.key;
          return (
            <Pressable
              key={o.key}
              testID={`${testIDPrefix}-${o.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(o.key)}
              style={[
                styles.btn,
                compact && styles.btnCompact,
                sel
                  ? { backgroundColor: colors.accent }
                  : { borderColor: colors.line, borderWidth: 1 },
              ]}>
              <Text
                style={{
                  fontSize: compact ? 13 : 14,
                  fontWeight: '600',
                  color: sel ? colors.onAccent : colors.sub,
                }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text style={[styles.hint, compact && styles.hintCompact, { color: colors.faint }]}>
          {hint}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 8, padding: 10 },
  segmentCompact: { padding: 0, gap: 6 },
  btn: { flex: 1, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  btnCompact: { height: 32, borderRadius: 16 },
  hint: { fontSize: 12, paddingHorizontal: 14, paddingTop: 0, paddingBottom: 12, lineHeight: 18 },
  hintCompact: { paddingHorizontal: 0, paddingBottom: 0, fontSize: 11, lineHeight: 16 },
});
