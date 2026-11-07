# 云乐坊 AI 点数渠道

`@el-bot/yunlefun` 为小云云端 DSH 增加独立的「云乐坊 AI 点数」模型提供商和授权设置页。个人 API Key 继续由原有提供商管理，授权或余额不足不会自动切换渠道，也不会修改已有会话的模型选择。

## 授权与计费

在 DSH 侧栏打开「云乐坊 AI」，确认扣点范围，再到云乐坊完成设备授权。客户端为 `el-bot-cloud`、应用为 `el-bot`，必须显式授予 `ai:agent`；普通 SSO 和会员登录不代表已授权扣点。授权绑定当前云端实例，连接它的手机、Mac、QQ 共用此账户积分，不能把这个模式当成面向陌生用户的独立钱包。

云端生成 P-256 安装密钥，使用新鲜 DPoP 证明调用 `desktop-auth` 和 `/ai/v1/el-bot/agent`。本地验证发行方签名、受众、应用、scope、安装指纹与到期时间。模型服务每次在线复查账号、客户端登记和 grant 撤销状态。凭据只保存在 profile 下 `el-bot-yunlefun/account.json`（目录 `0700`、文件 `0600`），浏览器、手机和模型提示词不会收到它们；运行器与 profile 必须由可信实例所有者管理。

服务端复用现有 CloudBase 积分账本、预算、任务引擎、Worker 和 Sweeper，以 `appId=el-bot`、`scope=agent` 预留和结算。1 AI 点 = 1,000 micro_point。目录返回完整服务端价格，客户端不能指定 UID、厂商密钥、价格或计费应用。价格在任务准入时复核；工具调用仅由 DSH 执行，网关 `maxSteps=1`，每次模型请求独立结算。

首版只开放经核对的 DeepSeek 文本及工具调用，不声明图片、流式逐字输出或推理强度选择。结果完成结算后回传 DSH，保留工具调用 ID、参数及用量。每请求最多 96 KiB 输入和 8,192 输出 token；超限在扣点前拒绝。

## 超时、恢复和撤销

发送前将请求编号和输入原子保存到私有文件；收到任务编号后删除本地输入副本。断网、重启和重试继续使用同一请求编号。设置页可查询原请求的任务、恢复结果或取消；取消未知准入的请求不会新建付费任务。未确认账务的收据持续保留，已结算收据最多保留 500 条。服务端任务和账本的保留期限沿用 AI Runtime 配置。

刷新凭据在发送前标记为使用中。响应丢失后要求重新授权，不会重放可能已经轮换的 refresh token。重新授权必须使用同一账户；账务未确认时阻止本地断开，避免丢失恢复入口。设置页的「停止本实例使用积分」清除本地授权；完整在线撤销到云乐坊账户的设备管理进行。

## 安装

先完成下述服务端发布和客户端登记，再在目标实例使用构建产物：

```sh
pnpm --filter @el-bot/yunlefun build
pnpm --filter @el-bot/yunlefun pack --pack-destination /tmp/el-bot-artifacts
```

把包解压到部署目录的 `yunlefun/`，作为只读目录挂载至 `/opt/dsh-runtime/node_modules/@el-bot/yunlefun`；可合并 [Compose 覆盖文件](./deploy/compose.override.yaml)。使用既有 HOME 和 profile，先运行配置预览：

```sh
node yunlefun/deploy/configure.mjs --profile-directory "$HOME/.dsh/profiles/cloud"
```

核对目录与两个 HTTPS origin 后，以同一参数加 `--apply` 执行。脚本为原 manifest 和 patch 创建 `0600` 备份，仅追加新 bundle。默认公开 origin 为 `https://bot.yunle.fun`，模型 Runtime 仍使用现有 CloudBase 服务域名，未涉及 Dokploy 切流。

## 服务端发布依赖

本次配套改动位于本机 `YunLeFun/api-el-bot-ai` 和 `YunLeFun/www-el-bot-ai` 工作区，必须与插件一同审阅和发布：

1. `authorization-core` 增加只允许设备适配器且显式同意的 `ai:agent` scope。按现有 SSO Registry 审批发布流程登记 `specs/sso-client-registry-platform/changes/2026-11-07-el-bot-cloud.client.json`，导出签名产物；不要手改 generated Registry 绕过审批。
2. 发布 `desktop-auth` 的独立 `/ai/v1/el-bot/agent` 授权映射及云乐坊授权页的范围说明。沿用当前内部服务凭据和 canonical origin，不把内部凭据配置到插件。
3. 同步发布 AI Runtime、Worker 与 Sweeper 的 agent 产品、工具结果桥接和原请求查询入口。无需新增数据库集合或放宽安全规则。
4. 在现有控制集合中配置 `application:el-bot` 策略，`enabled`、`modelEnabled` 与 `capabilities.agent` 必须显式启用，并设置独立的正数 `applicationDailyProviderCapMicroCny`。模型和价格来源复用经过校验的 CloudBase 目录与现有模型策略；未知价格及无效策略保持关闭。
5. 用固定合成账号验收授权、一次文本请求、一次工具循环、余额不足、取消、重放和 grant 撤销，确认每任务只有一次预留／结算且预留余额归零，再交给实际账户完成授权。

### 2026-11-07 生产验收

生产 Registry 已通过审批与签名发布，generation 为 18，策略版本为 `2026-11-07-el-bot-ai-v1`。AI Runtime 已发布至 `ai-runtime-038`，Worker、Sweeper、`desktop-auth` 和独立 `application:el-bot` 策略已同步上线。小云实例已安装插件，并保留现有 Compose 覆盖文件与模型选择。

使用临时合成身份完成设备授权、DPoP 重放拒绝、文本生成、工具调用与结果回传、重复请求去重、取消、余额不足和撤销授权验收。7 条有模型用量的任务均只有一条用量记录和一次结算；取消释放、未预留失败与账户流水逐项核对，最终余额、预留和活动预留数均为零。测试授权与 Auth 身份已清理，未使用维护者个人积分。

实际账户需在小云的「云乐坊 AI」面板发起并确认授权，然后在模型选择中选择「云乐坊 AI 点数」下的模型。多个终端访问同一个云端实例时共享这次积分授权。既有个人 API 模型不会自动切换。

配套发布：[AI Runtime](https://github.com/YunLeFun/api/pull/18)、[授权能力](https://github.com/YunLeFun/www.yunle.fun/pull/149)、[签名 Registry](https://github.com/YunLeFun/www.yunle.fun/pull/150)。飞书旧卡片在降级邮件后显示 `200671` 的问题已由 [Admin 修复](https://github.com/YunLeFun/admin/pull/52) 上线处理。 设备授权码过期时的通用函数异常提示已由 [授权页修复](https://github.com/YunLeFun/www.yunle.fun/pull/151) 上线处理，页面会指引回到原应用重新发起授权。
