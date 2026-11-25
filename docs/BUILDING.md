# 构建说明

## 双平台检查

```bash
npm ci
npm test
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android --platform ios --output-dir dist
```

## Android

常规环境：

```bash
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Windows 使用 `.\gradlew.bat`。需要 JDK 21 与 Android SDK；当前验证版本为 Gradle 9.4.1、compileSdk 37、targetSdk 36、NDK 27.1.12297006、CMake 3.22.1。

### Windows C++ 长路径

若 Ninja 报 `mkdir(...react_codegen...): No such file or directory`，将完整项目复制到短路径（例如 `D:\odsm`）再 prebuild。某些 React Native codegen 对象路径即使短路径也超过 Windows 限制，需要：

1. 先执行 `:app:configureCMakeRelWithDebInfo[arm64-v8a]` 生成 `android/app/.cxx/RelWithDebInfo/*/arm64-v8a/build.ninja`。
2. 将 build.ninja 中 `.dir/D_/.../*.o` 对象名缩短为稳定的 `.dir/o/<hash>.o`，同步替换所有引用。
3. 直接运行 Ninja。
4. 执行 assembleRelease 时排除已经手动完成的 configure/build 两任务。

不要手改并提交 CNG 生成的 `android/`。发布 APK 前验证 `apksigner verify`、包名、versionCode 和 ABI。个人侧载可使用测试签名，公开发布应使用你自己的发布密钥且不要提交密钥。
