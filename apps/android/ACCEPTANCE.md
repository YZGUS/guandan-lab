# Android 验收状态

更新：2026-09-27。真机为 Redmi K60（型号 23013RK75C），Android 15，通过 USB ADB 连接；屏幕 1440×3200，系统密度 560。

## PASS

- Kotlin 编译、10 项 JUnit 单测、Debug APK、Android 测试 APK 和 Lint。
- 应用 ID 与 namespace：`com.yzgus.guandan.android`。
- 局域网端口 `8788` 与 Guandan relay 路径。
- 公网 HTTP 拒绝、私有地址 HTTP 调试、HTTPS 云端入口。
- 预测返回回调与旧版返回键兼容代码编译通过；返回操作已在本轮 Android 15 真机验证。
- 新图标覆盖安装成功；桌面显示深绿底金色 G，与德州扑克的 H 区分。
- 原生首页顶部安全区域修复；安全区域改由根容器统一处理，WebView 横屏同时避开摄像头区域。
- 真机局域网扫描发现电脑的 8788 服务，进入大厅、创建房间并开局；初始 27 张手牌完整显示。
- 真机点击提示、出牌成功，手牌从 26 张减为 25 张；点击“不要”保持当次手牌数不变，牌局继续。
- 横竖屏切换、规则面板打开/关闭、离桌确认和返回大厅通过；本轮局域网测试房间已关闭。
- 地址输入框弹出键盘后，返回键关闭键盘并保留发现页。
- 真机云端扫描识别 `https://49.233.153.141/guandan/` 的直接服务与 relay 端点，合并后显示一个在线入口。
- 真机邀请码登录成功，加载云端牌局，连接状态为 `connected`；系统返回发现页后重新进入，无需再次输入邀请码。
- 新包云端竖屏、横屏截图已检查。横屏 WebView 左、上分别避让 138 物理像素；可用视口约 875×372 CSS 像素，未发现玩家卡片越界、文字截断或与出牌区、手牌区、比分重叠。

## 本轮范围与截图证据

本轮为首轮真机联调，不代表所有 Android 版本和完整牌局规则都已通过真机验收。游戏操作在独立本地数据目录的测试房间进行；云端仅验证登录、现有牌局展示和返回后恢复，没有在既有房间主动出牌或离桌。

逐步截图与界面树保存在本机忽略目录 `.data/android-review-20260927/`，不上传用户手机截图或邀请码：

| 文件 | 验证内容 |
| --- | --- |
| `01-icon-home.png` | 新 G 图标与德州 H 图标 |
| `04-lan-result.png` | 实际局域网发现结果 |
| `07-game-portrait.png` | 27 张手牌的竖屏牌桌 |
| `08-hint.png`、`09-play.png` | 选牌与成功出牌 |
| `10-game-landscape.png`、`12-rules.png` | 横屏牌桌、规则面板 |
| `13-leave-dialog.png`、`14-returned-lobby.png` | 离桌确认与返回大厅 |
| `16-safe-discovery.png` | 修复后的原生首页安全区域 |
| `21-keyboard-open.png`、`22-keyboard-dismissed.png` | 软键盘及返回键行为 |
| `23-cloud-result.png`、`25-cloud-authenticated.png` | 云端发现与登录后的牌局 |
| `26-cloud-landscape.png` | 新包横屏摄像头安全区域 |
| `28-cloud-back-discovery.png`、`29-cloud-session-restored.png` | 返回发现页与重新进入云端 |

操作通过 ADB 触控进行，截图和界面树由逐步测试包与 ADB 采集；用调试 WebView 的 DOM 补充核对手牌数、连接状态及元素边界。测试包的命令回执不单独作为功能通过依据。邀请码通过已有本地凭据输入登录表单，未记录到截图或文档。

本轮 Debug APK SHA-256：`8da528feee87a15c1ee064017f43634ecf18cc7c02297116d3bb7e45cec8c3ff`。

## 尚未验证

- 断网/切换 Wi-Fi 与蜂窝网络后的重连、多真人完整对局和长时间后台恢复。
- Android 8–14、Android 16、其他厂商设备及不同导航栏模式。
- 系统主题图标的真机外观：单色 G 资源已更新并编译通过，本次手机桌面使用普通图标。
- 厂商系统对热点宿主端口和后台运行的限制。

此前的 `INSTALL_FAILED_USER_RESTRICTED` 安装阻断已解除，本次两次覆盖安装均返回 `Success`。当前 APP 是客户端，未实现 Android 手机内部托管牌局服务器。
