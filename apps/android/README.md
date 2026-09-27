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
