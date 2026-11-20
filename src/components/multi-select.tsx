import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

interface Option<T extends string> {
  key: T;
  label: string;
  /** 行尾的小字（收录数之类） */
  hint?: string;
}

interface Props<T extends string> {
  /** testID 为 `-field` / `-option-<key>` / `-done` / `-backdrop` */
  testIDPrefix: string;
  /** 弹层标题 */
  title: string;
  options: Option<T>[];
  value: T[];
  onChange: (keys: T[]) => void;
  /** 字段下面那行小字（已选几部、共几首） */
  hint?: string;
  /** 点不动的选项（例如收藏为空时的「我的收藏」） */
  disabledKeys?: T[];
}

/** 字段上那行摘要：全选说「全部」，一两个报名字，多了报前两个 + 等几部 */
export function summaryOf(labels: string[], total: number): string {
  if (!labels.length) return '未选择';
  if (labels.length >= total) return `全部 ${total} 部`;
  if (labels.length <= 2) return labels.join('、');
  return `${labels[0]}、${labels[1]} 等 ${labels.length} 部`;
}

/**
 * 多选 select（下拉多选框）：设置页「每日精选」用。
 *
 * 字段点开是一个从底部升起的清单，逐项勾选，改一项就 `onChange` 一次（调用方即时落库），
 * 「完成」只是收起来 —— 不做「确定 / 取消」两段，省得用户勾完忘了点确定。
 *
 * **至少留一个**：只剩一项时再点它就是取消全部，那会让首页没有诗可挑，
 * 所以这里直接忽略这次点击（`lib/daily.ts` 的 `toggleDailyScope()` 是同一套规矩）。
 * 落库前调用方按 `options` 的顺序写，同一个选择永远同一个串 —— 缓存指纹靠它对齐。
 */
export function MultiSelect<T extends string>({
  testIDPrefix,
  title,
  options,
  value,
  onChange,
  hint,
  disabledKeys,
}: Props<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const locked = new Set(disabledKeys ?? []);
  // 只剩一项时点它就是清空，直接不许点
  const last = selected.size <= 1;

  const toggle = (key: T) => {
    if (locked.has(key)) return;
    if (selected.has(key)) {
      if (last) return; // 必须选择一个
      onChange(options.filter((o) => o.key !== key && selected.has(o.key)).map((o) => o.key));
      return;
    }
    onChange(options.filter((o) => o.key === key || selected.has(o.key)).map((o) => o.key));
  };

  const labels = options.filter((o) => selected.has(o.key)).map((o) => o.label);

  return (
    <>
      <Pressable
        testID={`${testIDPrefix}-field`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text numberOfLines={1} style={[styles.fieldText, { color: colors.text }]}>
          {summaryOf(labels, options.length)}
        </Text>
        <Text style={[styles.count, { color: colors.faint }]}>
          {`${selected.size}/${options.length}`}
        </Text>
        <Text style={[styles.chevron, { color: colors.sub }]}>▾</Text>
      </Pressable>
      {hint ? (
        <Text testID={`${testIDPrefix}-hint`} style={[styles.hint, { color: colors.faint }]}>
          {hint}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <View style={styles.root}>
          {/* 点空白处收起：放在下面一层，清单本身不接受它的点击 */}
          <Pressable
            testID={`${testIDPrefix}-backdrop`}
            accessibilityLabel="关闭"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />
          <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={[styles.sheetHead, { borderBottomColor: colors.line }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
              <Pressable
                testID={`${testIDPrefix}-done`}
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                hitSlop={10}>
                <Text style={[styles.done, { color: colors.accent }]}>完成</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listPad}>
              {options.map((o) => {
                const sel = selected.has(o.key);
                const off = locked.has(o.key);
                return (
                  <Pressable
                    key={o.key}
                    testID={`${testIDPrefix}-option-${o.key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: sel, disabled: off || (sel && last) }}
                    disabled={off}
                    onPress={() => toggle(o.key)}
                    style={[styles.row, { borderBottomColor: colors.line }, off && styles.off]}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: sel ? colors.softText : off ? colors.faint : colors.text },
                      ]}>
                      {o.label}
                    </Text>
                    {o.hint ? (
                      <Text style={[styles.rowHint, { color: colors.faint }]}>{o.hint}</Text>
                    ) : null}
                    <Text style={[styles.tick, { color: sel ? colors.accent : 'transparent' }]}>
                      ✓
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    marginHorizontal: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  fieldText: { flex: 1, fontSize: 15 },
  count: { fontSize: 12 },
  chevron: { fontSize: 12 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingTop: 6, lineHeight: 18 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: 18,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 15, fontWeight: '600' },
  done: { fontSize: 15, fontWeight: '600' },
  list: { flexGrow: 0 },
  listPad: { paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  off: { opacity: 0.45 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowHint: { fontSize: 12 },
  tick: { fontSize: 14, width: 16, textAlign: 'right' },
});
