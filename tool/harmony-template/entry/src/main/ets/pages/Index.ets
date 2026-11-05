import {
  AnyJSBundleProvider,
  FileJSBundleProvider,
  MetroJSBundleProvider,
  ResourceJSBundleProvider,
  RNApp,
  RNOHErrorDialog,
  RNOHCoreContext,
  RNOHLogger,
  TraceJSBundleProviderDecorator,
} from '@rnoh/react-native-openharmony';
import { createRNPackages } from '../RNPackagesFactory';

// RN 的宿主页面：一个 RNApp 就够。JS 侧入口是 `AppRegistry.registerComponent('__APP_KEY__')`
// （expo-router/entry 注册的名字就是 main）。
//
// bundle 的来源按顺序试（AnyJSBundleProvider）：
//   1. Metro（开发时：hdc rport tcp:8081，改 JS 自动刷新）
//   2. /data/storage/el2/base/files/bundle.harmony.js（推包调试用）
//   3. rawfile 里的 bundle.harmony.js（Release：`just hap` 会先 bundle-harmony 打进包）
@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private rnohCoreContext: RNOHCoreContext | undefined = undefined;
  @State shouldShow: boolean = false;
  private logger!: RNOHLogger;

  aboutToAppear(): void {
    this.logger = this.rnohCoreContext!.logger.clone('Index');
    const stopTracing = this.logger.clone('aboutToAppear').startTracing();
    this.shouldShow = true;
    stopTracing();
  }

  onBackPress(): boolean | undefined {
    // 必须自己吞掉返回键：Ability 的默认行为是退到后台，而 RN 侧要能先处理
    this.rnohCoreContext!.dispatchBackPress();
    return true;
  }

  build() {
    Column() {
      if (this.rnohCoreContext && this.shouldShow) {
        if (this.rnohCoreContext?.isDebugModeEnabled) {
          RNOHErrorDialog({ ctx: this.rnohCoreContext });
        }
        RNApp({
          rnInstanceConfig: {
            name: '__APP_KEY__',
            createRNPackages,
            // 文本测量走 NDK（更贴近 RN 的排版预期，中文字号 / 行高才对得上）
            enableNDKTextMeasuring: true,
            enableBackgroundExecutor: false,
            // 三方库若还在 ArkTS 架构上实现自定义组件，把组件名登记在这里
            arkTsComponentNames: [],
          },
          appKey: '__APP_KEY__',
          jsBundleProvider: new TraceJSBundleProviderDecorator(
            new AnyJSBundleProvider([
              new MetroJSBundleProvider(),
              new FileJSBundleProvider('/data/storage/el2/base/files/bundle.harmony.js'),
              new ResourceJSBundleProvider(
                this.rnohCoreContext.uiAbilityContext.resourceManager,
                'bundle.harmony.js',
              ),
            ]),
            this.rnohCoreContext.logger,
          ),
        });
      }
    }
    .height('100%')
    .width('100%');
  }
}
