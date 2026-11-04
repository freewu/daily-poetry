import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { canSpeak, hasWebSpeech } from './lib/tts';

/** web 能同步判断；原生只能异步问系统要 voice 列表，先乐观显示 */
function initialSupport(): boolean {
  return Platform.OS === 'web' ? hasWebSpeech() : true;
}

/**
 * 系统有没有可用的语音合成 —— 「朗读」按钮与设置里的「朗读」整段都跟着它走。
 *
 * - web：没有 SpeechSynthesis 就 false，同步出结果，不会先闪一下再收起来；
 * - 原生：`getAvailableVoicesAsync()` 返回空数组 = 没装 / 没启用 TTS 引擎，
 *   把入口收起来；查询本身失败（老系统、API 缺失）当作支持——查不到就藏功能
 *   比留个按钮更糟。
 */
export function useTtsSupport(): boolean {
  const [supported, setSupported] = useState(initialSupport);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    // 包一层 Promise：getAvailableVoicesAsync 不存在时是同步 throw，.catch 接不住
    Promise.resolve()
      .then(() => Speech.getAvailableVoicesAsync())
      .then((voices) => {
        if (alive) setSupported(canSpeak(voices));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return supported;
}
