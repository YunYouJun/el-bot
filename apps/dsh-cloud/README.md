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

把 `Dockerfile`、`.dockerignore`、`entrypoint.sh`、`cutover.mjs`、`history.mjs`、`compose.yaml` 放入部署目录，将打包产物解压到该目录的 `dsh/`（其中应直接包含 `package.json`、`cordis.patch.yml`、`dist/`）。profile 的 bundles 增加 `@el-bot/dsh`，原分组插件路径替换为 `@el-bot/dsh/qq-workspaces`，具体配置见 `packages/dsh/README.md`。镜像包含 Git，以支持公开仓库导入。`home/` 必须由容器 UID 1000 读写，目录权限 `700`、凭据文件 `600`。快照、`.env` 与真实 profile 只保留在私有目录，不进入 Git，也不进入镜像。

```sh
docker compose build
docker compose up -d
docker compose ps
```

容器以非 root 用户运行，重启策略为 `unless-stopped`，配置内存、CPU 和日志上限。宿主只在 `127.0.0.1:3080` 发布 Web 端口；DSH 保留原生连接认证。客户端使用已有 SSH 配置建立 `127.0.0.1:13080 → 云机 127.0.0.1:3080`，读取该容器的原生认证入口，再打开系统浏览器。

云端默认使用 `DeepSeek API → deepseek-flash`。启动时 `cutover.mjs` 对现有 QQ 私聊和群聊调用宿主原生模型切换，检查历史前缀和分组，再记录 `~/.dsh-qqbot/cloud-cutover.json`。后续启动不再覆盖用户选择。TokenLink → Hy4 保留；使用它的机器仍需能正常访问 TokenLink 内网入口。

## 运维与恢复

个人云机部署位置为 `/srv/yunlefun/el-bot-dsh`，容器名 `el-bot-dsh`。服务器的固定公网出口需要加入 QQ 开放平台白名单。检查 `home/.dsh-qqbot/workspace-grouping-status.json`、`cloud-cutover.json` 和容器健康状态，再通过真实私聊与群聊验证收发。

镜像内公共模块目录必须可遍历（`0755`），模块文件可读（`0644`）。`COPY --chmod=0644` 可能同时创建不可遍历的父目录，因此 Dockerfile 会显式修正目录权限。数据目录继续保持私有权限。验证时先检查 QQ 后台在线，再发送真实私聊和群内未 @ 背景消息；等待模型空闲后重启容器，复查上线及上下文回复。

Web 恢复与 QQ 恢复同一会话时，持久化写锁可能先于 live agent 发布。分组适配只针对 `SessionAlreadyOwnedError` 短暂重试（最多 30 次、间隔 100ms），让官方 SessionManager 复用已发布的 agent；持续占用或其他持久化错误仍会使初始化失败。不会为绕过写锁删除历史或创建替代会话。

迁移后以云端会话为准，本地桌面历史不自动双向同步。恢复时先停止全部 QQ 接收端，恢复部署文件和 `home/`，使用同版本镜像启动；沿用目录映射和文件权限。回退到本机前先停止云端容器，再恢复本机 profile 的 QQ 启用状态。

在已有云乐坊基础设施上，需要把部署配置和数据登记到 `/etc/yunlefun/workloads.json` 的文件备份清单。该应用没有独立数据库；不要把 DSH 登录 URL、Key、QQ 凭据或聊天记录写入公开验收文档。

未 @ 的待处理群消息存于 `home/.dsh-qqbot/group-history/<AppID>/`，文件名为群键摘要，目录 `700`、文件 `600`，原子替换。每组遵循现有 `historyLimit`，并设硬上限 100 条、单条 4000 字符、有效期 24 小时；模型回复后沿用官方插件的清空行为。只接管指定 AppID，不影响其他机器人。初始化需要固定 QQ 插件 `0.5.5`；持久化文件损坏会明确报错，不覆盖原数据。
