import { RNAbility } from '@rnoh/react-native-openharmony';

// RNOH 的 Ability 基类：onCreate 里建 RNOHCoreContext、把页面 loadContent 进来，
// 生命周期（前后台 / 返回键 / 窗口尺寸）都由它转给 RN。这里只要告诉它首页在哪。
export default class EntryAbility extends RNAbility {
  protected override getPagePath(): string {
    return 'pages/Index';
  }
}
