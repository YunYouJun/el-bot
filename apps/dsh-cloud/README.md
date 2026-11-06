# 小云 Bot 云端运行

DSH Web、官方 QQ 插件和自动分组适配放在同一个独立容器中。当前固定 DSH `0.2.1-rc.5`、QQ 插件 `0.5.5`，复用个人云机的 Docker，不修改其他站点。

## 桌面与 Web 的分工

| 桌面客户端                                | 云端 DSH Web                       |
| ----------------------------------------- | ---------------------------------- |
| 菜单栏／托盘驻留、关窗与唤起              | 常驻 QQ 连接与模型执行             |
| 打开 QQ、Codex、CodeBuddy、DSH 等本机程序 | 查看完整会话与历史、切换模型、分组 |
| 本机机器人的有限启停入口                  | 云端提供方、插件与运行配置         |
| 建立 SSH 连接并打开 Web                   | 云端工作目录与任务                 |
| 人设摘要与快捷切换                        | 人物卡导入、预览、更新与版本管理   |

桌面首页保留快捷操作，本机状态可展开；路径、展示设置和日志收进高级设置。远程页面在系统浏览器中打开，不加载到有 Tauri 权限的窗口中。客户端只保存 SSH 别名，不保存模型 Key 或 DSH 登录令牌，也不接受网页传入的 shell 命令。

## 准备与迁移

先构建 `@el-bot/dsh`（人物卡管理和 QQ 分组共用此包）。以下操作需要已绑定官方 QQ 插件的本机 DSH profile，以及本机已有的 TokenLink 和 DeepSeek 凭据。迁移前正常关闭本机 DSH，暂停本机 QQ 条目，保证只有一端接收。已有云端实例升级时不要重新迁移历史，先私下备份现有 profile 和部署目录，再替换插件。

```sh
pnpm --filter @el-bot/dsh build
pnpm --filter @el-bot/dsh pack --pack-destination /tmp/el-bot-dsh-artifacts
node apps/dsh-cloud/migrate.mjs .el-bot/dsh-cloud-staging
```

快照包含会话日志、标题缓存、工作区、QQ 会话偏好和工作目录。它不复制其他提供方的密钥、账号登录凭据或会话锁。容器内沿用原本的 HOME 路径，所以日志、会话 ID、cwd 和祖先关系无需改写；标题缓存也可以按原会话标识恢复。宿主上的数据实际位于部署目录的 `home/` 下。本机其他项目只保留历史和目录标识，项目源码需要另行迁移。

把 `Dockerfile`、`.dockerignore`、`entrypoint.sh`、`cutover.mjs`、`health.mjs`、`healthcheck.mjs`、`history.mjs`、`security-smoke.mjs`、`compose.yaml` 放入部署目录，将打包产物解压到该目录的 `dsh/`（其中应直接包含 `package.json`、`cordis.patch.yml`、`dist/`）。profile 的 bundles 增加 `@el-bot/dsh`，原分组插件路径替换为 `@el-bot/dsh/qq-workspaces`，具体配置见 `packages/dsh/README.md`。镜像包含 Git，以支持公开仓库导入。`home/` 必须由容器 UID 1000 读写，目录权限 `700`、凭据文件 `600`。快照、`.env` 与真实 profile 只保留在私有目录，不进入 Git，也不进入镜像。

```sh
docker compose build
docker compose up -d
docker compose ps
```

容器以非 root 用户运行，重启策略为 `unless-stopped`，配置内存、CPU 和日志上限。宿主只在 `127.0.0.1:3080` 发布 Web 端口；DSH 保留原生连接认证。客户端使用已有 SSH 配置建立 `127.0.0.1:13080 → 云机 127.0.0.1:3080`，读取该容器的原生认证入口，再打开系统浏览器。

云端默认使用 `DeepSeek API → deepseek-flash`。启动时 `cutover.mjs` 对现有 QQ 私聊和群聊调用宿主原生模型切换，检查历史前缀和分组，再记录 `~/.dsh-qqbot/cloud-cutover.json`。后续启动不再覆盖用户选择。TokenLink → Hy4 保留；使用它的机器仍需能正常访问 TokenLink 内网入口。

## OpenAI API 与客户端切换

从 el-bot 客户端点击「打开云端 DSH」，在账号菜单的「设置 → 模型 → 添加模型提供商」中选择内置 `openai`，填写专用 OpenAI API Key 并保存。DSH 将密钥写入云端 `~/.dsh/.credentials.yaml`（权限 `600`），提供方配置只记录 `apiKeyEnv: OPENAI_API_KEY`。桌面客户端不保存 Key。内置目录随 DSH 依赖更新，具体模型能否调用取决于 OpenAI 项目的权限和额度。

在「小云 Bot · 私聊」或「小云 Bot · 群聊」中打开要调整的会话，点击输入框下方的模型名称，即可在 OpenAI、DeepSeek 等已配置提供方间切换。选择应用于下一次请求，保留会话历史；正在执行的请求继续使用开始时的选择。QQ 分组适配读取宿主持久化的模型选择，并同步该会话的 QQ 模型偏好，使 QQ 后续消息、会话恢复及模型分支沿用同一选择。不同 QQ 会话分别保存偏好，无需为切换模型重启机器人。

验收需要同时检查界面选择和会话日志中实际请求的 `provider`／`model`。仅看模型按钮或回复内容不能证明已切换成功。还应重启后复查偏好和历史。云机必须能够通过 HTTPS 访问 `https://api.openai.com/v1`；连接超时、DNS 或地区访问问题需要先解决，已保存 Key 不代表真实调用已通过。网络未就绪时保留可用的原模型。

## 运维与恢复

个人云机部署位置为 `/srv/yunlefun/el-bot-dsh`，容器名 `el-bot-dsh`。服务器的固定公网出口需要加入 QQ 开放平台白名单。检查 `home/.dsh-qqbot/workspace-grouping-status.json`、`cloud-cutover.json` 和容器健康状态，再通过真实私聊与群聊验证收发。

健康检查同时要求本轮启动的 QQ SDK 已收到 `ready`／`resumed`、分组模块就绪、进程存活和 Web 可访问。每次启动生成新的 `cloud-boot.json`，旧启动留下的状态不能冒充在线；`disconnected`／`stop` 会立即清除连接就绪状态。已有 profile 升级时添加 `el-bot-cloud-health`（入口 `file:///opt/dsh-runtime/health.mjs`，配置机器人 `appId`），并让 QQ 条目依赖 `qqRuntimeHealth`，见迁移程序生成的配置。Web 页面能打开不能单独证明机器人在线。

镜像内公共模块目录必须可遍历（`0755`），模块文件可读（`0644`）。`COPY --chmod=0644` 可能同时创建不可遍历的父目录，因此 Dockerfile 会显式修正目录权限。数据目录继续保持私有权限。验证时先检查 QQ 后台在线，再发送真实私聊和群内未 @ 背景消息；等待模型空闲后重启容器，复查上线及上下文回复。

Web 恢复与 QQ 恢复同一会话时，持久化写锁可能先于 live agent 发布。分组适配只针对 `SessionAlreadyOwnedError` 短暂重试（最多 30 次、间隔 100ms），让官方 SessionManager 复用已发布的 agent；持续占用或其他持久化错误仍会使初始化失败。不会为绕过写锁删除历史或创建替代会话。

迁移后以云端会话为准，本地桌面历史不自动双向同步。恢复时先停止全部 QQ 接收端，恢复部署文件和 `home/`，使用同版本镜像启动；沿用目录映射和文件权限。回退到本机前先停止云端容器，再恢复本机 profile 的 QQ 启用状态。

在已有云乐坊基础设施上，需要把部署配置和数据登记到 `/etc/yunlefun/workloads.json` 的文件备份清单。该应用没有独立数据库；不要把 DSH 登录 URL、Key、QQ 凭据或聊天记录写入公开验收文档。

## 入群防护与升级验收

新迁移要求已有唯一私聊主人，并加载 `@el-bot/dsh/qq-security`；QQ 条目依赖 `qqRuntimeSecurity`。默认没有获准群，不再继承开放群模式。只有原配置已显式列出的群白名单会保留。已有实例升级时，在私有 profile 添加安全条目、指定主人 C2C OpenID 和已确认的测试群 OpenID，并为 QQ 条目补上依赖，见 [`@el-bot/dsh` 群聊防护](../../packages/dsh/README.md#群聊防护)。群内自称主人、群管理命令或审批按钮均不能授权；主人通过绑定私聊使用工具。

升级前备份现用镜像、profile、人物卡、QQ 偏好和工作区索引，保留已有 Compose override。先构建新镜像，再运行下列离线验收；通过后停止旧接收端，原子替换配置与人物卡选择，再启动新镜像。不要把真实凭据打进镜像，也不要让新旧实例同时连接 QQ。新安全策略接管时群会话从空上下文开始，旧历史仍保留；人物卡变更沿用原有准入换新语义。

```sh
docker compose build dsh
docker compose run --rm --no-deps --entrypoint node dsh /opt/dsh-runtime/security-smoke.mjs
docker compose up -d --no-deps dsh
```

`security-smoke.mjs` 使用镜像内真实 Cordis、工具管线与 QQ SDK，在临时目录模拟身份、命令、引用与按钮事件，验证局部工具、嵌套调用及“允许”策略无法绕过群聊 guard，同时确认主人工具可用。它不启动 QQ 连接，不读取真实凭据，不调用模型，不向真实用户或群发送消息。可进一步使用 `docker run --network none --entrypoint node <镜像> /opt/dsh-runtime/security-smoke.mjs` 在无数据挂载和无网络环境验收。

上线后检查本轮健康状态、群白名单、人物卡新版本和安全 journal 权限，再由已获准测试群验证真实 @ 收发。离线模拟通过和机器人在线不代表已经完成真实群消息的端到端验收。旧 DSH 会话日志保留原有历史；不能把背景缓冲有效期当成历史日志删除策略。

未 @ 的待处理群消息存于 `home/.dsh-qqbot/group-history/<AppID>/`，文件名为群键摘要，目录 `700`、文件 `600`，原子替换。每组遵循现有 `historyLimit`，并设硬上限 100 条、单条 4000 字符、有效期 24 小时；模型回复后沿用官方插件的清空行为。只接管指定 AppID，不影响其他机器人。初始化需要固定 QQ 插件 `0.5.5`；持久化文件损坏会明确报错，不覆盖原数据。
