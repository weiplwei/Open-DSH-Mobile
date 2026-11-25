# Contributing

欢迎问题反馈和 Pull Request。

## 开发

需要 Node.js 22.13+：

```bash
npm ci
npm test
npm run typecheck
npm run lint
npx expo export --platform android --platform ios --output-dir dist
```

Expo 原生依赖使用 `npx expo install <package>` 添加。路由放在 `src/app/`，非路由代码放在 `src/` 其他目录。不要提交 CNG 生成的 `android/`、`ios/`。

## 项目边界

- 仅实现局域网连接，不加入公网 relay 或 Expo tunnel。
- 不复制原 App 的专有代码或素材，不实现订阅绕过。
- 不提交二维码文本、deviceKey、设备凭据、SecureStore 导出、个人会话或构建签名。
- 涉及真实写操作的测试使用独立测试会话/工作区，不污染用户数据。

## 发布

更新 `package.json` 与 `app.json` 的版本，Android 同步递增 versionCode，iOS 同步 buildNumber。提交前确保测试、类型、lint、Doctor 与双平台导出通过。
