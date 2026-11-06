# @el-bot/mobile

云伯特 iOS 原生伴侣端的 DSH bundle。部署、配对和设备撤销见 [iOS 开发说明](../../docs/development/ios-companion.md)。

固定适配 DSH `0.2.1-rc.5`，不依赖未发布的其他工作区模块。`publicBaseUrl` 必须是 HTTPS origin，由 profile 的 `cordis.patch.yml` 覆盖。

| 接口（相对 `/el-bot/mobile/v1`）  | 权限与用途                           |
| --------------------------------- | ------------------------------------ |
| `POST /pair`                      | 一次性配对码兑换设备凭据             |
| `GET /device`、`DELETE /device`   | 查看或撤销当前设备                   |
| `GET /sessions`、`POST /sessions` | 列表或在固定移动工作区创建会话       |
| `GET /sessions/:id?before=seq`    | 文本历史，最多 80 条消息             |
| `POST /sessions/:id/messages`     | 新消息及稳定 requestId，原生队列提交 |
| `GET /status`                     | 当前进程的 QQ 连接状态               |

除配对外均需 `Authorization: Bearer <device-token>`。请求 JSON 上限 20 KiB；配对尝试限制为每分钟二十次；最多二十台有效设备。所有响应禁止缓存。管理员 Unix socket 位于 profile 的 `el-bot-mobile/admin.sock`，不通过公网路由开放。
