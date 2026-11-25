# Open DSH Mobile · LAN Edition

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE) [![Release](https://img.shields.io/github/v/release/weiplwei/Open-DSH-Mobile)](https://github.com/weiplwei/Open-DSH-Mobile/releases)

独立实现的开源 DSH 手机客户端。电脑端继续使用 MIT 许可的 [`WNLUO/dsh-mobile-plugin`](https://github.com/WNLUO/dsh-mobile-plugin)，手机端通过公开 Mobile API v2 互操作。无账号、无订阅、无内购、无广告、无统计上报。

**[下载 Android APK](https://github.com/weiplwei/Open-DSH-Mobile/releases/latest)** · **[iPhone 使用说明](#iphoneexpo-go)** · **[问题反馈](https://github.com/weiplwei/Open-DSH-Mobile/issues)**

本项目不包含原 App 的反编译代码，不修改原 App，也不绕过其授权机制。界面与品牌为独立实现。

## 当前功能

从早期 MVP 升级为完整的局域网工作台：

- 中性深色界面：按电脑/工作区分组的会话卡片、置顶、搜索、归档、相对时间与连接延迟。
- 会话操作：新建、重命名、fork、置顶、归档；新建页可选择工作区、Agent 预设、模型与思考等级。
- 实时聊天：Mobile API v2 SSE、指数退避重连、流式 Markdown 草稿、低频历史校准、历史分页、停止、排队与插话。
- 富内容：标题、列表、引用、表格、围栏代码、粗斜体、删除线、安全链接、工具调用展开、图片附件全屏预览与分享。
- 文件附件：图片上传，通用文档上传到电脑工作区/收件箱并附加模型可见路径；历史附件按需解密读取。
- 审批与提问：工具审批、允许一次/拒绝、单选/多选、自定义回答与计划待审卡片。
- 子代理：树状列表、运行状态、进入子会话、续话与打断。
- 电脑文件：目录导航、隐藏文件、筛选、文本预览、上传和系统分享。
- Git：仓库状态、分支、提交记录、文件 diff、暂存/取消暂存、提交、切换分支和推送已有上游。
- 定时任务：每日、每周、cron，工作区选择、启停、立即运行与删除。
- 设置：宿主与设备信息、局域网安全说明、断开并忘记电脑。

目前不包含原 App 的插件市场、宿主渠道管理、GitHub PR/Forge、文件编辑/删除和 shell 功能；服务端也不提供任意 shell。业务功能依赖插件版本与设备权限。

## 仅限局域网

配对只使用 `lanUrls`、`directUrl` 和 `ipv6Candidates`，主动丢弃二维码里的公网中转地址。旧配对记录也会过滤公网地址；支持 RFC1918、链路本地、Tailscale CGNAT、`.local` 等局域网地址。

手机和电脑必须能互相访问。若二维码只有公网中转地址，客户端会拒绝配对，而不是悄悄走外网。

1. 在电脑 DSH 的 Mobile/Relay 插件页面生成配对二维码。
2. 手机与电脑接入同一局域网，允许电脑防火墙中的 DSH 端口。
3. 启动 Open DSH，扫码，或粘贴完整配对文本。
4. 配对成功后旧二维码会轮换，这是正常的安全行为。

HKDF-SHA256、AES-256-GCM、HMAC-SHA256 用于 Mobile API v2；配对凭据保存在 iOS Keychain / Android Keystore-backed SecureStore。不要把二维码文本、deviceKey 或设备凭据提交到仓库。

## 环境

- Node.js 22.13+（Expo SDK 58）
- npm
- 电脑端已安装并启用 dsh-mobile-plugin 0.5.113 或兼容版本

```bash
npm install
npm test
npm run typecheck
npm run lint
```

测试包括上游跨端加密向量、Markdown、结构化消息、LAN 地址白名单、SSE 拆包、文件分块解密、附件提示词和定时规则。

## iPhone：Expo Go

当前原生模块均包含在对应 SDK 的 Expo Go 中：

1. 从 App Store 安装最新版 **Expo Go**，确保 iPhone 与电脑接入同一局域网。
2. Expo 官方自 2026-09-03 起要求 iPhone 真机登录：电脑运行 `npx expo login --browser`，Expo Go 登录**同一个免费 Expo 账号**。这不是 Open DSH 账号或订阅。
3. 项目目录运行 `npx expo start --lan --port 8081 --clear --go`。
4. iPhone 相机扫描终端的 **Metro/Expo 二维码**，在 Expo Go 中打开。
5. Open DSH 启动后，再扫描 DSH 插件配对二维码；两个二维码用途不同。

电脑必须保持 Metro 运行。也可以在 DSH 的 **Plugins → Add plugin** 中安装仓库内的 [`launcher`](./launcher)，让 Metro 随 DSH 自动启动，并随 DSH 正常退出自动关闭。若手机打不开，允许 Node.js 通过 Windows 专用网络防火墙，并检查访客网络/AP 隔离。本项目不使用 tunnel，因为 tunnel 属于外网连接。

若 Expo Go 报 `SQLiteGetResultsError ... updates.scope_key, updates.commit_time`，用 `--clear --go` 重启 Metro，彻底关闭 Expo Go 后重试；仍冲突时删除并重装 Expo Go 清它自己的更新缓存。

独立 iOS 包仍受 Apple 签名约束。EAS 云构建需要 Expo/Apple 账号；免费个人签名通常需要 macOS + Xcode，并有有效期限制。Windows 不能直接用 Xcode 编译 IPA。

## Android 构建

详细环境与 Windows 长路径处理见 [`docs/BUILDING.md`](./docs/BUILDING.md)。具备 JDK 21 和 Android SDK 时可完全本地构建：

```bash
npx expo prebuild --platform android --no-install
cd android
# Windows：
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
# macOS / Linux：
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

APK 位于 `android/app/build/outputs/apk/release/app-release.apk`。Windows 如遇 C++ `ninja: mkdir ... No such file or directory`，把构建副本移到短路径（例如 `D:\odsm`）再构建。Expo 默认用 debug keystore 给本地 release APK 做测试签名，适合个人侧载，不应用作商店发布签名。

也可登录自己的 Expo 账号后运行 `npx eas-cli@latest build --profile preview --platform android`。`android/`、`ios/` 均由 Expo 生成，不应手工纳入源码管理。

双平台 JS 验证：

```bash
npx expo export --platform android --platform ios --output-dir dist
```

## 实测情况

2026-11-25 对本机 dsh-mobile-plugin 0.5.113 做只读真实回归：

- 374 个总会话 / 65 个根会话与最近 183 条消息
- 5 个工作区、5 个 Agent 预设、8 个模型分组
- 子代理目录、定时任务目录、目录 listing
- Git repo/status/branches/log 只读接口
- 真实文件分块解密下载（6035 bytes）
- SSE `text/event-stream` 建连与连续 3 个认证帧解密

回归脚本不会发送模型提示词，也不会执行 Git/schedule 写操作。发送、停止、审批和写操作使用同一已验证的加密 POST 通道与上游契约；实际可用性仍取决于具体会话状态和宿主权限。

## 许可

代码以 MIT 发布。`test/e2ee-vectors.json` 来自同名 MIT 上游项目，用于跨端互操作验证；上游版权说明保留在 `THIRD_PARTY_NOTICES.md`。
