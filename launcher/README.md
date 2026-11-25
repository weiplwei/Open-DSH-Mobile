# Open DSH Mobile launcher

在 DSH 的 **Plugins → Add plugin** 中选择本目录。插件默认把上一级目录识别为 Open DSH Mobile 项目根目录；也可用环境变量 `OPEN_DSH_MOBILE_DIR` 指定其他源码目录。

随 DeepSeek Harness 的生命周期管理 Open DSH Mobile 的 Metro 开发服务：

- DSH 启动：在项目目录运行 `npx expo start --lan --port 8081 --clear --go`。
- Metro 意外退出：DSH 仍运行时，3 秒后自动重启。
- DSH 正常退出或禁用插件：Windows 使用 `taskkill /T /F` 关闭完整 Metro 进程树，macOS/Linux 关闭进程组。
- 日志写入插件目录的 `metro.log`。
- 不执行 Android 构建，不启动公网 tunnel。

强制结束 DSH 进程或电脑断电时，操作系统不保证执行退出钩子；正常关闭 DSH 时会执行清理。
