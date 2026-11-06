# @el-bot/mobile

小云 macOS / iOS 原生客户端的 DSH bundle。部署、配对和设备撤销见 [iOS 开发说明](../../docs/development/ios-companion.md)。

固定适配 DSH `0.2.1-rc.5`，不依赖未发布的其他工作区模块。`publicBaseUrl` 必须是 HTTPS origin，由 profile 的 `cordis.patch.yml` 覆盖。

0.1.3 增加默认关闭的 `phone.enabled`。开启后，iOS 原生入口为本机 iCTRL 创建十分钟专用控制会话，并通过 DSH 的 `phone_open_app` 工具打开白名单中的 App。手机主动轮询，Bearer 与独立通道凭据共同验证；网页 Cookie 不能领取，iCTRL 密钥不上云。任务按真实 Agent 会话隔离，领取即消费，不自动重放。部署与真机验收见开发说明。

| 接口（相对 `/el-bot/mobile/v1`）  | 权限与用途                            |
| --------------------------------- | ------------------------------------- |
| `POST /pair`                      | 一次性配对码兑换设备凭据              |
| `GET /device`、`DELETE /device`   | 查看或撤销当前设备                    |
| `GET /sessions`、`POST /sessions` | 列表或在固定移动工作区创建会话        |
| `GET /sessions/:id?before=seq`    | 文本历史，最多 80 条消息              |
| `POST /sessions/:id/messages`     | 新消息及稳定 requestId，原生队列提交  |
| `GET /sessions/:id/models`        | 当前会话模型及可用模型目录            |
| `PUT /sessions/:id/model`         | 切换会话下一次请求的 provider/model   |
| `GET /status`                     | 当前进程的 QQ 连接状态                |
| `POST /web/ticket`                | 已配对设备申请一次性完整 Web 登录票据 |
| `POST /web/launch`                | 用一次性票据建立独立网页会话          |
| `POST /phone/channel`             | 为本机授权创建专用手机控制会话        |
| `DELETE /phone/channel`           | 关闭当前设备控制通道                  |
| `GET /phone/next`                 | 使用设备与独立通道凭据领取一次性任务  |
| `POST /phone/results`             | 提交幂等的手机执行收据                |
| `GET /account`                    | 查询账号同步是否启用与轻量偏好        |
| `POST /account/instances`         | 查询账号名下在线云端及一次性入会票据  |
| `POST /account/link`              | 校验云乐坊 SSO 身份断言并关联账号     |
| `PUT /account/preferences`        | 保存白名单内的语言偏好                |
| `DELETE /account`                 | 解除本实例的账号关联                  |

配对、账号发现、入会票据兑换和 Web 票据兑换不要求已有设备 bearer，其余原生接口均需 `Authorization: Bearer <device-token>`。请求 JSON 上限 20 KiB；配对尝试限制为每分钟二十次；最多二十台有效设备。所有响应禁止缓存。管理员 Unix socket 位于 profile 的 `el-bot-mobile/admin.sock`，不通过公网路由开放。

0.1.2 增加可选的完整 Web 网关。配置 `web.enabled: true`、`web.port: 3082`，并启用部署模板中的 `DSH_WEB_GATEWAY` 后，iOS 可通过已有设备配对建立网页会话。票据有效六十秒、仅可用一次；网页 Cookie 独立于原生 Bearer，DSH 原始登录凭据保留在服务器。每次网页请求检查设备有效性，撤销设备后关闭已有长连接。未认证的根路径和 RPC 仍为 404；网关默认关闭。

账号路由默认关闭。只有配置 `account.cloudbaseEnvId`、`account.appId`、`account.clientId`、`account.issuer` 和 `account.jwksUrl` 后才启用；`POST /account/link` 使用 `@yunlefun/sso/server` 校验 CloudBase access token 与短时身份断言，按 `userId` 关联账号，并只持久化昵称等展示字段和语言偏好。不保存 SSO code、ticket、access token、identity assertion 或会话历史；设备凭据仍是业务 API 的唯一授权。客户端必须按 `@yunlefun/sso` 流程取得双证明后再调用此路由；生产使用还需在云乐坊 SSO Registry 登记原生客户端及精确 HTTPS 回调。

`discovery` 为可选协议 groundwork：默认关闭，配置账号校验、入会密钥和在线实例后才开放只读发现；再注入 `discovery.tickets` 才允许兑换。票据只用于一次兑换本实例可撤销的 device token，账号证明不会变成长期 API bearer。真实跨实例目录需由云乐坊账号中心提供 heartbeat 和票据签发，单独部署验收。

0.1.1 仅投影人类输入与助手文本，过滤内部运行上下文，并返回可用于超时核对的 requestId。模型目录和会话级选择直接委托 DSH 公共 Session Controller，由其完成精确路由校验、持久化与并发串行化；移动端不操作内部会话文件。客户端共用 packages/yun-apple。
