# Android 验收状态

## PASS

- Kotlin 编译、JUnit 单测、Debug APK 和 Lint。
- 应用 ID 与 namespace：`com.yzgus.guandan.android`。
- 局域网端口 `8788` 与 Guandan relay 路径。
- 公网 HTTP 拒绝、私有地址 HTTP 调试、HTTPS 云端入口。
- Android 16 预测返回回调与旧版返回键兼容路径。

## 尚未验证

- 真机局域网扫描、安装与 WebView 牌局；本轮 ADB 安装被设备端 `INSTALL_FAILED_USER_RESTRICTED` 拒绝，APK 未进入安装阶段。
- 目标公网域名、TLS、反向代理和邀请登录。
- 厂商系统对热点宿主端口和后台运行的限制。
