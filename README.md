# Guandan Lab

可在电脑、手机浏览器和 Android App 中运行的四人掼蛋。牌局由服务端统一判定，支持真人与 Bot 混桌、断线恢复、局域网开桌和云端邀请模式。

**四人固定牌桌 · 南北/东西搭档 · 两副牌 108 张 · Web + Android**

## 快速开始

需要 Node.js 20.19+ 或 22.12+：

```bash
npm ci
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/`。开发模式同时启动：

- Web：`0.0.0.0:5173`
- HTTP / WebSocket：`0.0.0.0:8788`

创建房间时默认加入三个 Bot，可以立即开始一局；减少 Bot 数量后可等待同一局域网中的真人加入。

## 局域网模式

生产构建后由一台电脑或 Android 终端提供单端口服务：

```bash
npm run build
PORT=8788 npm start
```

其他设备访问：

```text
http://<开桌设备的局域网 IP>:8788/
```

健康检查：`http://<IP>:8788/health`。

## 云端邀请模式

公网部署必须使用 HTTPS，并配置真实网页来源：

```bash
GUANDAN_DEPLOYMENT_MODE=cloud \
GUANDAN_INVITE_CODES='Alice:请替换为高强度邀请码,Bob:请替换为另一个邀请码' \
GUANDAN_ALLOWED_ORIGINS='https://cards.example.com' \
GUANDAN_PUBLIC_URL='https://cards.example.com/guandan' \
GUANDAN_COOKIE_SECURE=true \
GUANDAN_TRUSTED_PROXIES='127.0.0.1' \
PORT=8788 \
npm start
```

服务端通过 HttpOnly Cookie 保存登录，不向 Web 客户端暴露云端会话令牌。Nginx 与 systemd 示例位于 [`deploy/`](./deploy)。

## Android App

Android 客户端提供原生入口：

- 扫描当前 Wi-Fi / 以太网私有 `/24` 网段的 `8788/health`。
- 解析用户填写的服务器或 `/.well-known/guandan-lab.json` relay。
- 私有网段允许 HTTP 调试，公网端点要求 HTTPS。
- 选择端点后，通过受限同源 WebView 进入完整 React 大厅和牌桌。

构建：

```bash
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

Debug APK：`apps/android/app/build/outputs/apk/debug/app-debug.apk`。

## 项目结构

```text
apps/web          React 大厅、等待室和响应式牌桌
apps/server       HTTP、WebSocket、房间、认证与 JSON 持久化
apps/android      局域网/云端发现与受限 WebView
packages/core     规则、状态转换、进还贡和隐藏信息视图
packages/protocol 网络消息与运行时校验
packages/bot      基础搭档策略
docs              规则、架构和已验收设计 Demo
```

## 当前规则与边界

已实现常用完整牌型、逢人配、炸弹比较、接风、3/2/1 升级、过 A，以及自动进贡/还贡/抗贡。具体口径见 [`docs/RULES.md`](./docs/RULES.md)。

当前 Bot 是可完成牌局的基础策略，不代表高水平掼蛋 AI。贡还牌在首版由服务端自动选择，后续会开放为显式玩家阶段。

## 验证

```bash
npm test
npm run build
npm run android:check
```

设计基准保存在 [`docs/design-demo.html`](./docs/design-demo.html)。
