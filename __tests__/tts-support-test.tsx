// 朗读入口的显示条件：系统得有语音合成，没有就别露出「朗读」按钮和「朗读」设置。
// 原生是异步问 voice 列表（模拟没有 TTS 引擎的设备：返回空数组），
// web 同步看 SpeechSynthesis 在不在。

import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { canSpeak, hasWebSpeech } from '@/lib/tts';
import { useTtsSupport } from '@/tts';

const g = globalThis as any;

function Probe() {
  const supported = useTtsSupport();
  return <Text testID="probe">{supported ? 'yes' : 'no'}</Text>;
}

const HAD_VOICES = g.__SPEECH__.voices;

afterEach(() => {
  g.__SPEECH__.voices = HAD_VOICES;
  g.__SPEECH__.getAvailableVoicesAsync.mockImplementation(async () => g.__SPEECH__.voices);
});

describe('canSpeak', () => {
  it('有语音就算支持，空列表不算', () => {
    expect(canSpeak([{ language: 'zh-CN' }])).toBe(true);
    // 只有英文语音也算：那是语言包问题，藏掉入口用户连试都没法试
    expect(canSpeak([{ language: 'en-US' }])).toBe(true);
    expect(canSpeak([])).toBe(false);
  });

  it('查不到（null / undefined / 非数组）当作不支持', () => {
    expect(canSpeak(null)).toBe(false);
    expect(canSpeak(undefined)).toBe(false);
    expect(canSpeak('zh-CN' as unknown as unknown[])).toBe(false);
  });
});

describe('hasWebSpeech', () => {
  it('SpeechSynthesis 与 SpeechSynthesisUtterance 都在才为真', () => {
    expect(hasWebSpeech({ speechSynthesis: {}, SpeechSynthesisUtterance: () => {} })).toBe(true);
    expect(hasWebSpeech({ speechSynthesis: {} })).toBe(false);
    expect(hasWebSpeech({})).toBe(false);
    expect(hasWebSpeech(null)).toBe(false);
  });
});

describe('useTtsSupport', () => {
  it('系统有语音：显示朗读入口', async () => {
    await render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('yes'));
    expect(g.__SPEECH__.getAvailableVoicesAsync).toHaveBeenCalled();
  });

  it('系统没有任何语音（没装 TTS 引擎）：收起朗读入口', async () => {
    g.__SPEECH__.voices = [];
    await render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('no'));
  });

  it('查询本身失败时当作支持，别因为查不到就把功能藏了', async () => {
    g.__SPEECH__.getAvailableVoicesAsync.mockRejectedValue(new Error('no engine'));
    await render(<Probe />);
    // 先渲染出「有」，失败后也不会翻成「没有」
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('yes'));
  });
});
