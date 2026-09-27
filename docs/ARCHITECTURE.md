# 架构

```text
apps/web       React 大厅、等待室与响应式牌桌
apps/server    HTTP、WebSocket、房间、认证、持久化与静态资源
apps/android   原生端点发现 + 受限同源 WebView
packages/core  唯一规则事实源、隐藏信息视图与状态转换
packages/protocol 经过 Zod 校验的网络消息与房间视图
packages/bot   只读取授权 DecisionContext 的基础搭档策略
```

本地与云端使用完全相同的房间服务和规则核心，差异只存在于身份与入口：

- `local`：匿名可恢复会话，监听局域网地址，Android 扫描当前私有 `/24` 网段的 `8788/health`。
- `cloud`：邀请码换取 HttpOnly Cookie，校验 Origin、连接数和房间配额，通过 HTTPS 反向代理暴露。

客户端提交 `matchId + expectedVersion + actionId + action`。服务端检查身份、成员关系、轮次、状态版本、牌张归属、牌型与大小；Web 和 Android 只消费裁剪后的公共牌桌与本人手牌。
