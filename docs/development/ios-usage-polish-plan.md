# iOS 用量页收尾：DeepSeek 实施计划

## 目标与分工

基线：`4d32dfb`。在独立 worktree 完成「AI 点数与用量」页的第二轮 UI 收尾，保留已有置顶余额、紧凑指标和合并空态。实施模型使用 CodeBuddy 的 `deepseek-v4.1-flash`；Codex 负责评审、编译和模拟器验收。

本轮仅改原生展示与文案，不改授权、Keychain、服务器、账本、统计数学和模型调用。DeepSeek 只获得文件工具，不获得终端、浏览器、MCP、部署、Git 发布或支付能力。原工作区的其他未提交改动不得纳入本次。

## 实施顺序

### 1. 统计口径面板

- 页面提供可访问的原生信息按钮，通过 `.sheet(item:)` 打开有标题和关闭按钮的说明面板。
- 收入现有长说明：仅小云、全账户与应用差异、北京时间、退款发生时间、负净消耗、模型分摊、Token 不随退款减少、未归属模型和分页范围。
- 主页面保留简短必要提示，避免每个区块重复长段落。说明面板支持滚动和大字体。
- 完成条件：长说明能在面板完整阅读；空态和非空态均可打开、关闭，关闭不重置所选周期。

### 2. 模型行和用量详情

- 列表模型名称最多两行，金额保持可读；原生 NavigationLink 打开「模型用量详情」。
- 详情展示完整模型 ID、可选择/复制的公开 ID、所选周期、扣点、退款、净消耗、已结算任务和输入/输出 Token，全部来自该周期的 `YunleModelConsumption`。
- 未归属模型也可查看，明确其历史信息缺失，不显示无意义的复制按钮。
- 这里是完整的模型汇总详情，不是按模型筛选的交易流水。当前服务端未提供模型流水筛选，不能从已加载的首页伪造完整模型交易记录；该能力列入后续服务端工作。
- 完成条件：周期与金额对应准确；长名称、未知模型、全额退款仍能阅读；返回保留周期。

### 3. 更新时间和旧快照

- 把状态放到汇总附近，避免只在页面底部才知道数据时间。
- 汇总截止时间取 `consumption.asOf`，不能把较早的服务端快照标成当前时间；可另注明账户同步时间。
- `store.stale` 为真时，靠近汇总显式提示旧快照并可重试。初次失败不得显示零余额或「暂无消费」。
- 保留 store 的 busy 防重入、下拉刷新、错误反馈和原有完整明细分页，不改客户端协议。

### 4. 文档与本地检查

- 新增文案须同时维护 canonical `apps/el-bot-client/locales/{en,zh-Hans}.json` 与逐字一致的 `YunCore/Resources` 副本。
- 更新 `yunlefun-ios-account.md` 描述新展示，并纠正只读 RPC 动作列表包含 `summary`。
- 不为纯布局编写镜像实现的测试。由 Codex 运行编译、catalog 校验和 UI 验收；DeepSeek 的交付说明应如实注明未执行的检查。

## 文件范围

可修改：

- `packages/yun-apple/Sources/YunUI/YunleAccountView.swift`
- `packages/yun-apple/Sources/YunUI/YunleConsumptionSections.swift`
- 同目录新增名称以 `Yunle` 开头的 SwiftUI 文件。
- `apps/el-bot-client/locales/en.json`、`zh-Hans.json` 及对应的 `packages/yun-apple/Sources/YunCore/Resources` 副本。
- `docs/development/yunlefun-ios-account.md`。

计划文件由 Codex 维护。禁止修改其他路径，包括 `YunCore/YunleAccount.swift`、项目/签名配置、后端、依赖与锁文件。遵循根 AGENTS.md：英语代码/注释、中文文档，不读取或输出凭据和用户 session。

## Codex 验收门槛

- 差异全部落在允许路径；金融口径、授权和原始数据保持准确。
- iOS 17+ 编译通过；`node scripts/check-apple.mjs --catalog-only` 通过，文案静态检查通过。
- iPhone 17 Pro / iOS 26.5 模拟器：真实账号空态、说明面板、余额详情返回；独立测试数据：有消费、跨期退款、全额退款、未知/长模型名、模型详情和周期保持。
- 验证英文辅助功能大字体、明暗主题的主要内容可读，关键交互有明确可访问标签。
- 记录截图与实施模型身份；未实际通过的验收不得标为完成。

## 后续发布验收（本轮不自动执行）

- 实体 iPhone 使用最终签名包验收，需先协调原工作区正在进行的签名/Keychain 身份改动。
- 用户另行确认预算和调用后，做一笔真实模型扣点，核对小云今日、本月、累计及模型归属；退款仅走既有允许流程，不为造数据修改账本。
- 当前不把本人账户的真实消费链路记为已验收，不部署、不发布商店包、不自动消费云乐坊积分。
