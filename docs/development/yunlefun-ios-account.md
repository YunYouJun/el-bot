# iOS 云乐坊账号与 AI 用量

在小云 iOS 的「设置 → 云乐坊账号」登录，完成系统登录窗口内的显式授权后，可进入「AI 点数与用量」。这项能力不要求先配对云端 DSH。

- 可用点数、预留点数、累计消耗是云乐坊账户总额。
- 「小云用量记录」仅展示 `el-bot` 已结算扣点和退款，包含可用的模型名称、输入/输出 token、金额和时间；支持下拉刷新和分页。
- 预留、释放不作为消费记录。模型用量明细超过 Runtime 保留期时仍保留账本回执，模型信息显示暂不可用。
- 刷新失败时保留上次快照并明确标记，不显示成零余额。

## 小云专属消耗汇总

「小云消耗汇总」可切换今日、本月、累计，展示小云扣点、退款、净消耗和已结算任务数，下方按相同周期展示各模型的净消耗与输入/输出 Token。它与「账户点数（全部应用）」分开：账户余额和累计消耗仍包含其他应用。

统计范围仅为云乐坊积分计费的 `el-bot` 已结算流水。今日和本月按北京时间划分，退款按退款发生时间计入；净消耗等于扣点减退款，因此跨日或跨月退款可能让某周期净消耗为负。预留、释放、赠送、调整以及自备 API Key 的调用不计入。模型退款按剩余扣点比例分摊，整数 microPoint 分配保持总额守恒；已使用的 Token 不因退款减少。

服务端 `summary` 只读动作使用完整账本，不依赖 iOS 已加载的明细页数。跨分页读取前后核对账户版本，变化时重试；稳定结果短暂缓存，跨北京时间零点失效。模型信息与账本金额无法核对时，金额进入「未归属模型」，不会猜测或漏算。超过读取预算或分页安全上限时返回不可用，App 保留旧快照，不能把部分流水当作累计值。

## 授权边界

iOS 独立客户端为 `el-bot-ios`，归属 `el-bot`；只读 scope 为 `ai:usage`，同时显式请求 `membership:read`。不复用 `el-bot-cloud`、云端 `ai:agent` entitlement、DSH 网页 Cookie 或个人模型 Key。登录不授予 App 模型执行和扣点能力，退出也不撤销云端实例已有的扣点授权。

采用现有 `https://api.yunle.fun/desktop-auth` 设备授权：安装生成 P-256 密钥，每次请求使用新 ES256 DPoP；批准后校验 issuer、Ed25519 签名、公钥、audience、app、scope、时间和安装绑定。私钥、entitlement、轮换 refresh token 一并保存在 `WhenUnlockedThisDeviceOnly` Keychain。设备码只保留在当前登录内存中。

AI Runtime `POST /ai/v1/mobile/el-bot-account` 接受带 entitlement、DPoP 和签名请求正文的原生 RPC。仅支持 `account`、`transactions`，由服务器从有效 grant 派生用户及固定应用。接口不具备模型执行或任务写入依赖，不返回提示词、对话、工具输出或底层服务凭据。

刷新前先持久化待确认标记，网络丢失结果后不重放旧 refresh token；退出通过安装绑定的 `revokeEntitlement` 撤销当前 family，成功后清除 Keychain，失败可重试。

## 实施与验证

原生代码位于 `YunCore/YunleAccount.swift`、`YunUI/YunleAccountView.swift`，iOS 设置页接入独立 store。`YunleAccountServing`、传输和安全存储均可注入离线替身；测试覆盖只读登录、DPoP 签名/正文绑定、退出、刷新不确定结果与错误 audience/安装/scope。

配套网站与 Runtime 必须先发布对应代码，再通过云乐坊签名 Registry 登记 `el-bot-ios`。未登记时登录显示未启用，不回退为云端执行客户端。UI 离线预览不代表生产登录已经通过；最终还需在系统认证窗口用真实账号完成一次只读授权，并核对服务端余额与记录。

2026-11-08 已完成生产部署与 Registry 第 20 代登记。在 iPhone 17 Pro（iOS 26.5）模拟器的实际 App 中，用真实账号完成只读授权，核验了余额、预留、累计消耗与空用量状态；终止并重启 App 后，Keychain 登录恢复及在线查询均通过。验证未产生模型扣点。Swift 测试、模拟器构建和真机 arm64 编译通过；尚未安装到物理 iPhone 验证。

同日汇总接口已发布到 `ai-runtime-040`，沿用现有只读授权。实际 App 已核验三个统计周期、模型空状态与账户总额区分；独立测试数据预览另行验证模型金额、退款、Token、长名称换行及周期联动。70 个 Swift 测试与 API 完整发布检查通过。
