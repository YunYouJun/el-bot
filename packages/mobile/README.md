# @el-bot/mobile

小云 macOS / iOS 原生客户端的 DSH bundle。部署、配对和设备撤销见 [iOS 开发说明](../../docs/development/ios-companion.md)。

固定适配 DSH `0.2.1-rc.5`，不依赖未发布的其他工作区模块。`publicBaseUrl` 必须是 HTTPS origin，由 profile 的 `cordis.patch.yml` 覆盖。

| 接口（相对 `/el-bot/mobile/v1`）  | 权限与用途                           |
| --------------------------------- | ------------------------------------ |
| `POST /pair`                      | 一次性配对码兑换设备凭据             |
| `GET /device`、`DELETE /device`   | 查看或撤销当前设备                   |
| `GET /sessions`、`POST /sessions` | 列表或在固定移动工作区创建会话       |
| `GET /sessions/:id?before=seq`    | 文本历史，最多 80 条消息             |
| `POST /sessions/:id/messages`     | 新消息及稳定 requestId，原生队列提交 |
| `GET /sessions/:id/models`        | 当前会话模型及可用模型目录           |
| `PUT /sessions/:id/model`         | 切换会话下一次请求的 provider/model  |
| `GET /status`                     | 当前进程的 QQ 连接状态               |
| `GET /account`                    | 查询账号同步是否启用与轻量偏好       |
| `POST /account/instances`         | 查询账号名下在线云端及一次性入会票据 |
| `POST /account/link`              | 校验云乐坊 SSO 身份断言并关联账号    |
| `PUT /account/preferences`        | 保存白名单内的语言偏好               |
| `DELETE /account`                 | 解除本实例的账号关联                 |

配对、账号发现和票据兑换不要求已有设备 bearer，其余均需 `Authorization: Bearer <device-token>`。请求 JSON 上限 20 KiB；配对尝试限制为每分钟二十次；最多二十台有效设备。所有响应禁止缓存。管理员 Unix socket 位于 profile 的 `el-bot-mobile/admin.sock`，不通过公网路由开放。

账号路由默认关闭。只有配置 `account.cloudbaseEnvId`、`account.appId`、`account.clientId`、`account.issuer` 和 `account.jwksUrl` 后才启用；`POST /account/link` 使用 `@yunlefun/sso/server` 校验 CloudBase access token 与短时身份断言，按 `userId` 关联账号，并只持久化昵称等展示字段和语言偏好。不保存 SSO code、ticket、access token、identity assertion 或会话历史；设备凭据仍是业务 API 的唯一授权。客户端必须按 `@yunlefun/sso` 流程取得双证明后再调用此路由；生产使用还需在云乐坊 SSO Registry 登记原生客户端及精确 HTTPS 回调。

`discovery` 为可选协议 groundwork：默认关闭，配置账号校验、入会密钥和在线实例后才开放只读发现；再注入 `discovery.tickets` 才允许兑换。票据只用于一次兑换本实例可撤销的 device token，账号证明不会变成长期 API bearer。真实跨实例目录需由云乐坊账号中心提供 heartbeat 和票据签发，单独部署验收。

0.1.1 仅投影人类输入与助手文本，过滤内部运行上下文，并返回可用于超时核对的 requestId。模型目录和会话级选择直接委托 DSH 公共 Session Controller，由其完成精确路由校验、持久化与并发串行化；移动端不操作内部会话文件。客户端共用 packages/yun-apple。
