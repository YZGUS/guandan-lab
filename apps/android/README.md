# Guandan Lab Android

原生端点发现与受限 WebView 客户端。局域网和云端都加载服务端提供的同一套 React 牌桌。

## 能力

- 局域网：只扫描当前 Wi-Fi / 以太网私有 `/24` 网段的 `8788/health`。
- 云端：支持直接服务器和 `/.well-known/guandan-lab.json` relay；公网强制 HTTPS。
- 合并：同一端点从两个通道发现时去重并保留来源。
- WebView：只允许继续加载用户所选端点的同源页面，不开放 JavaScript 原生桥。
- 恢复：旋转时保留 Activity 和 WebView；系统返回优先处理网页历史，再回到发现页。

## 构建

```bash
./gradlew testDebugUnitTest assembleDebug lintDebug
```

APK 位于 `app/build/outputs/apk/debug/app-debug.apk`。

## 用 Android Studio 开发与真机运行

1. 在 Android Studio 中选择 **Open**，打开本仓库的 `apps/android` 目录，等待 Gradle 同步。该目录包含 `settings.gradle.kts`，应用模块为 `app`。
2. 安装 Android SDK Platform 36 与 Platform-Tools；项目使用 AGP 9.0.1、Gradle Wrapper 9.1.0。本机以 JDK 21 构建通过，Java 源码目标为 17。
3. 手机开启开发者选项和 USB 调试，连接电脑后允许调试授权；在设备列表选中手机，运行配置选择 `app`，点击 **Run** 安装运行，或 **Debug** 设置 Kotlin 断点。无线调试可通过 **Pair Devices Using Wi-Fi** 配对。
4. 原生首页、服务器发现、WebView 容器与图标在此 Android 工程中修改；牌桌界面在 `apps/web`，出牌规则在 `packages/core`，房间服务在 `apps/server`。修改网页后须更新手机实际连接的 Web 服务，重新打 APK 不会打包或部署这些网页。

USB / Wi-Fi 真机连接与运行方式参考 [Android 官方说明](https://developer.android.com/studio/run/device)。

### 局域网联调

电脑与手机连接同一 Wi-Fi。在仓库根目录启动服务：

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=8788 npm start
```

手机打开 Guandan Lab，点击 **扫描局域网**，选择电脑的 `http://电脑局域网IP:8788`，进入大厅创建或加入房间。手机扫描的是 Wi-Fi 网段，USB 连接仅用于安装和调试，不会自动让手机发现电脑上的服务。

### 云端联调

在 APP 的地址框填写 `https://49.233.153.141/guandan/`，点击 **扫描云端**，选择该入口，再通过六位数字邀请码登录。邀请码不写入源码或文档。德州扑克与掼蛋使用独立的应用 ID 和服务入口。

当前 Android APP 是牌局客户端；手机可以在已连接的服务器上创建房间，但不会在手机内部启动供其他设备连接的游戏服务器。

### 检查与截图测试

```bash
./gradlew testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
adb devices -l
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
```

`DeviceSmokeTest` 需要同一局域网内存在 8788 服务，且能够访问上述云端入口。`DeviceReviewTest` 仅在显式传入 `interactiveReview=true` 时运行，供联调逐步操作并保存截图和界面树；不会随正式 APP 启动。

图标使用与德州扑克一致的深绿底和金色字母，掼蛋为 **G**，德州为 **H**；自适应图标与系统主题图标分别位于 `res/drawable/ic_launcher_foreground.xml` 和 `ic_launcher_monochrome.xml`。
