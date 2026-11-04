import { File, Paths } from 'expo-file-system';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { CARD_ALBUM } from './card';

export type SaveResult = 'saved' | 'denied' | 'failed';

export interface SaveOptions {
  /** iOS 必须先授权；Android 10+ 写 MediaStore 不需要权限，失败再要 */
  askFirst?: boolean;
  /** 相册里显示的文件名（不含扩展名） */
  name?: string;
}

/**
 * 截图落在缓存目录、名字带随机后缀（view-shot 用 createTempFile），
 * 先复制成干净文件名再入库，相册里看到的就是「每日一诗-静夜思-20261103.png」。
 * 复制失败不致命：直接拿临时文件存，只是名字难看。
 */
async function withCleanName(uri: string, name: string): Promise<string> {
  try {
    const dest = new File(Paths.cache, `${name}.png`);
    if (dest.exists) dest.delete();
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

/**
 * 存进「每日诗词」相册。
 * expo-media-library 的相册其实是 MediaStore 里的一个目录，只有建相册时**带着文件**
 * 才会真的创建（`Album.create(name, [])` 会因为取不到第一个文件而报错），
 * 所以这里分两条路：相册已存在就直接往里塞，不存在就带着这张图一起建。
 */
async function write(uri: string, name: string): Promise<void> {
  const src = await withCleanName(uri, name);
  const album = await Album.get(CARD_ALBUM).catch(() => null);
  if (album) {
    await Asset.create(src, album);
    return;
  }
  try {
    await Album.create(CARD_ALBUM, [src]);
  } catch {
    // 建相册失败也别丢图：退回系统默认目录
    await Asset.create(src);
  }
}

/**
 * 把截图存进相册。Android 10+ 往 MediaStore 里插图片不需要任何权限，所以默认直接写，
 * 失败才去要一次权限（老系统 / 被用户拒过）；iOS 必须先授权，调用方传 askFirst。
 */
export async function saveImageToLibrary(uri: string, opts: SaveOptions = {}): Promise<SaveResult> {
  const name = opts.name || `每日一诗-${Date.now()}`;
  if (opts.askFirst) {
    const perm = await requestPermissionsAsync(true).catch(() => null);
    if (!perm?.granted) return 'denied';
  }
  try {
    await write(uri, name);
    return 'saved';
  } catch {
    if (opts.askFirst) return 'failed';
  }
  const perm = await requestPermissionsAsync(true).catch(() => null);
  if (!perm?.granted) return 'denied';
  try {
    await write(uri, name);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/**
 * 调系统分享面板把卡片发出去。相册已经存好了，这里失败（web 没有分享能力 /
 * 用户取消 / 目标 App 报错）都不该影响「已保存」这个结果，所以只返回 boolean。
 */
export async function shareImage(uri: string, opts: { title?: string } = {}): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: opts.title ?? '分享诗词卡片',
    });
    return true;
  } catch {
    return false;
  }
}
