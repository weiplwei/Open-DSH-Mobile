# Security policy

请不要在公开 Issue 中提交配对二维码文本、deviceKey、设备凭据、SecureStore 导出、私人会话内容或签名密钥。

发现安全问题时，请先通过 GitHub 仓库的 Private vulnerability reporting（若已启用）或仓库所有者提供的私密渠道报告，不要公开可利用细节。

本项目只应在可信局域网中使用。公网中转被主动禁用，不代表可以把 DSH 端口直接暴露到互联网。业务请求使用 Mobile API v2 加密，但局域网 HTTP 的元数据仍应视为对同网络设备可见。
