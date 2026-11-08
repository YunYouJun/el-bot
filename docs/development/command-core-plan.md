# 插件命令核心复用实施计划

更新：2026-11-09。状态：实现、review 修复及独立提交验证均已完成。

## 目标与交付范围

将 el-bot 和 DSH QQ 重复的命令登记、查找及注销逻辑集中到一个小型公共模块，两种运行时各持有自己的实例。插件继续使用现有链式注册，简单命令直接执行并回复；多轮会话和上下文状态继续统一复用 DSH，issue #9 保持关闭。

本轮完成公共模块、两种运行时接入、插件卸载、结构化目录、文档示例和离线验收。QQ 后台面板的在线同步、群管理员只读权限、命令语法扩展和更多旧插件迁移另行实施。

实现应持续完成下面 P0–P3；不以提交另一份设计或只建立空类型包作为完成。按用户后续授权，验证通过后将本轮改动独立提交并合入主线；不发布、不部署、不修改真实 QQ 面板，也不启动真实机器人连接。

## P0 确认当前基线

本计划编写时工作区存在其他任务的已暂存和未暂存改动，包括 `packages/dsh/src/qq-security/` 向 `packages/dsh/src/qq/` 迁移。实施以启动时实际源码为准，不根据旧聊天恢复旧路径。

1. 阅读适用的 `AGENTS.md`，记录开始时的 `git status`、HEAD 和本轮目标文件已有差异。
2. 核对以下入口及其现有测试：
   - `packages/el-bot/core/bot/command/{index,types,utils}.ts`。
   - `packages/el-bot/core/bot/message.ts` 及 `packages/el-bot/test/{command,bot-lifecycle,adapters}.test.ts`。
   - `packages/dsh/src/qq-commands/{registry,router,builtins}.ts` 及 `registry.test.ts`。
   - DSH 当前 QQ 插件入口、policy、包导出及构建配置。
   - `scripts/smoke-cli.mjs` 和已有 tarball 验收方式。
3. 用现有定向测试建立基线。已有失败记录具体命令和错误，不删除测试或缩减全仓覆盖。
4. 同一文件出现新的并发修改时，重读并保留对方的差异；出现无法区分归属的冲突时，仅暂停该文件的修改，继续其他独立步骤。不要 reset、stash、覆盖或暂存其他任务的改动。

完成条件：明确哪些行为属于兼容契约、哪些差异在本轮开始前已存在，且新的模块不会成为路径迁移的回退。

## 模块设计

新增 `packages/commands`，包名 `@el-bot/commands`，暂设为私有工作区包。使用 ESM、strict TypeScript、`src/`、tsdown 和生成的类型声明，遵循仓库现有包约定。

依赖关系：`el-bot` 和 `@el-bot/dsh` 分别依赖 `@el-bot/commands`。公共模块不导入 Bot、Cordis、DSH、QQ SDK 或 NapCat，也不执行 handler、发送消息、管理权限或保存会话。

| 模块 | 职责 |
| --- | --- |
| 公共 catalog | 稳定名称及别名索引、保留名和冲突检查、注册顺序、注册与注销、目录读取 |
| el-bot Adapter | 保留 `Bot.command()`、`executeCommand()`、`getCommandHelp()`、中文及昵称/@触发、hooks 和回复 |
| DSH QQ Adapter | 保留 `qqCommands` 链式注册、斜杠路由、主人校验、持久去重、手动接管、内置命令委托和回复 |
| 业务模块 | 在实际存在双端调用时提取纯函数或显式依赖的业务函数 |

### 公共 Interface

核心以 `CommandCatalog<T>` 保存运行时自己的 payload，只需要三个主要操作：

- `register(entry)`：注册一个规范名称、可选别名及 payload，返回幂等注销函数。
- `resolve(name)`：按名称或别名返回原类型 payload，未命中返回 `undefined`。
- `list()`：按注册顺序返回每条命令一次，不因别名重复。

构造时允许传入已有差异确实需要的名称规范化、名称校验和保留名规则。规范化在登记和查找时保持一致。斜杠、昵称、@ 解析留在各 Adapter，不通过公共层重写消息。

名称索引和 payload 分开考虑：名称和别名在登记时固定，payload 保留原运行时类型。公共元数据只包含 `name`、`aliases`、`description`、`usage`、`examples`、`hidden`；从 payload 到目录元数据的投影由 Adapter 提供。不要将旧 `Command` 实例强转成 `QQCommandInfo`，也不要把 QQ 的 `scope`、`permission` 加入通用权限契约。

允许根据真实代码微调注册项的 TypeScript 形状，但只使用一个 payload 泛型，不建立通用中间件引擎、统一大 Context 或 handler 执行器。核心应真正取代重复索引实现，避免长期镜像维护两份注册表。

### 注册不变量

1. 一次注册先完成全部名称、别名及保留名校验，再修改索引；任何失败都不留下半条命令。
2. 规范名称和别名共享冲突空间；冲突保留原注册，不静默覆盖。
3. 注销同步移除该次注册的全部索引和目录项；重复调用无副作用。
4. 旧注销函数不能移除后来使用相同名称注册的新命令，按注册身份判断归属。
5. `list()` 返回独立的只读列表，元数据快照不暴露内部可修改数组；不冻结调用者的 handler 或旧 `Command` 实例。
6. 别名和注销只作用于定义目录，与 DSH session、消息去重和机器人凭据无关。

## P1 提取公共 catalog

- 实现以上 Interface 和注册不变量，测试通过公开 Interface 观察结果。
- 覆盖多实例隔离、规范化后的碰撞、主名与别名碰撞、保留名、失败原子性、注销后重注册、旧 disposer、列表顺序和快照隔离。
- 验证中文且保留大小写的规则与 QQ 英文且忽略大小写的规则可以分别使用同一个实现。
- 维持现有轻量空白分词行为，不新增引号、选项、子命令解析库或独立分词模块。

完成条件：公共包独立测试、构建和类型检查通过，运行时依赖为零；不是仅新增类型而保留两套相同索引算法。

## P2 接入 DSH 和 el-bot

### DSH QQ

- `QQCommandRegistry` 作为 Adapter 使用公共 catalog，保留原有 builder、`register()`、`resolve()`、`all()` 和帮助入口的兼容行为。
- 给注册返回的 builder 增加显式 `dispose()`，内部持有公共 catalog 返回的注销函数；现有 `.action()` 和 `register()` 仍返回 builder，避免改变链式调用的返回值。
- Cordis 插件在注册成功后立即通过 `ctx.effect` 绑定 `dispose()`。提供实际可用的示例，显式声明 `inject = ['qqCommands']`，并验证卸载/重新加载后命令与别名同时消失和恢复。
- 保留自定义命令与 `dsh-qqbot` 委托目录的区别：委托项可以出现在帮助里，不会因此变成本地 action；保留名称不能被自定义命令占用。
- 默认主人 C2C 校验、未知斜杠命令消费、群聊斜杠命令处理、持久去重、接管优先级和 QQ Markdown 回退均沿用基线。`permission('everyone')` 等元数据不能扩大入口的实际授权。

### el-bot

- 通过公共 catalog 管理登记和查找，保留 `Bot.command()` 及 `Command` 的既有链式行为；参数和回调的 `CommandContext` 类型不变。
- 保留中文名称、现有大小写行为、内置 `help`/`帮助`、私聊直接触发、群聊前缀规则和 hooks 消费顺序。
- 明确检查 `Command.children`、`desc`、`usageText`、`examples` 等可见成员以及注册后修改描述的行为，避免改为只读快照后产生隐藏破坏。需要兼容时优先由 Adapter 提供薄的兼容入口，不建立第二套同步索引。
- 插件重载按注册归属注销旧插件命令，保留手动注册命令；setup 部分失败时，已产生的登记必须进入既有重载/清理流程。
- 程序调用继续返回 `{ matched: false }` 或 `{ matched: true, result }`，保留命中但返回 `void` 的区别；程序调用 `context.reply()` 仍拒绝发送。
- 自动及手动回复仍绑定原消息，并保留 NapCat 消息链、引用行为和现有错误处理。

完成条件：两种 Adapter 均使用同一公共实现；原有命令测试继续通过；新增卸载、重载和异步回复回归覆盖。验证本地命令命中不会调用下游模型准入或创建模型会话，同时保留必要的消息元数据观测。

## P3 目录与文档收敛

- 从 Adapter 的已登记 payload 投影公共元数据快照，DSH 另附本地/委托来源和 QQ 专属元数据。
- DSH 的文本和 Markdown 帮助复用同一次目录筛选、详情查找与别名解析，保留各自格式、现有文字、长度限制和 hidden 行为。el-bot 帮助也从其同一 catalog 获取数据。
- 保留两种运行时的实际命令名称，不通过全局 `qqName` 映射强行配对中文命令和 QQ 英文命令。
- 本轮提供可读取的结构化目录和离线测试，作为以后 QQ 面板生成的输入；不编造面板协议字段，也不新增在线同步或自动 HTTP 请求。
- 更新 `docs/development/user-commands.md`、`packages/dsh/README.md` 及必要的包说明。提供一个最小 Cordis 命令示例和卸载方式；示例的模块路径必须与当前 exports、tsdown entry 和安装产物一致。
- 一条命令只有在已有真实双端业务时才共享 action；可以用两种 Adapter 调用同一个简单函数的离线测试证明复用，不批量迁移历史插件。

完成条件：帮助读取不执行 action、别名只展示一个目录项、卸载命令立即从目录消失；读者按示例可以正确注册和卸载一条命令。

## 构建与发布契约

- 导入公共包的运行时包声明 `workspace:*` 依赖，不只增加测试 alias 或 devDependency。
- 当前只发布 `el-bot`。公共私有包通过现有 tsdown 机制内联到两个产物；类型声明也必须能在隔离安装中解析，不残留对不可安装私有包的引用。
- 源码、Vitest、TypeScript、tsdown 的模块解析保持一致。若测试 alias 必须新增，不能据此跳过真实包构建与隔离安装。
- tarball 按现有仓库发布 smoke 流程生成和安装，确认没有未解析的 `catalog:`/`workspace:`、没有需要单独发布的私有依赖，CLI、framework/Nest 导入和命令类型均正常。
- 不改版本号，不运行 `pnpm release`，不新增公共包的发布任务。

## 验收清单

| 层次 | 必须证明的行为 |
| --- | --- |
| 公共 catalog | 冲突原子性、别名索引、实例隔离、注册顺序、幂等注销、旧 disposer 安全、目录快照隔离 |
| DSH 路由 | 简单命令直接返回、内置命令正确委托、未知命令不进入模型、权限/接管/去重行为兼容 |
| 插件生命周期 | Cordis 注册→卸载→重载，el-bot 插件重载及部分 setup 失败，无残留且手动命令保留 |
| el-bot 调用 | 中文和大小写、帮助、前缀与 hooks、程序调用、void、异常、并发消息目标与消息链兼容 |
| 目录与帮助 | 一份登记事实驱动目录和帮助，读取零 action 调用，卸载即时反映，委托来源准确 |
| 安装产物 | framework/Nest/CLI 和命令声明在隔离 tarball 安装后可用 |

先运行公共包及两个运行时的定向测试，再执行受影响包构建、类型检查和 tarball smoke。最终保留全仓 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm typecheck:packages` 以及文档构建结果；P0 已证明的无关失败单列，不宣称全通过，也不通过排除文件或删除断言修绿。

## 实施顺序与交付记录

建议按三个可审阅的改动组组织：公共 catalog；两种 Adapter 和生命周期；目录/文档/安装验收。每组验证通过后继续下一组，提交中排除并发任务的目录迁移和客户端改动。

实施者完成后在本文件末尾记录实际变更文件、执行过的检查及结果、相对于 P0 的既有失败和遗留事项。最终回复区分本轮新增差异与启动前已有差异。若无法兼容某个公开行为，先给出具体调用者和失败证据，再缩小改动范围；不要默默改变命令语法、权限或会话语义。

- [x] P0 基线和兼容契约已确认。
- [x] P1 公共 catalog 已替代重复索引算法。
- [x] P2 两种 Adapter 已接入，卸载及重载覆盖通过。
- [x] P3 目录和示例与实际安装产物一致。
- [x] 构建、类型、测试、文档和隔离安装结果已记录。
- [x] 最终差异仅包含本轮必要变更，既有任务改动保留。

## 实际结果（2026-11-09）

### 变更

- 新增私有工作区包 `packages/commands`：`CommandCatalog<T>`、原子注册、名称规范化/校验/保留名、别名索引、按注册身份幂等注销、顺序目录快照和 payload 元数据投影。
- DSH `qqCommands` 接入公共 catalog；`QQCommandBuilder` 新增 `dispose()`；内置命令通过 `ctx.effect` 绑定注销；新增 `directory()` 结构化目录；帮助文本和 Markdown 共用目录筛选与查找。
- el-bot `Command` 接入公共 catalog；保留 `Bot.command()`、`executeCommand()`、`getCommandHelp()`、`children` 读取视图、可变描述/用法/示例、中文名称、前缀、@、hooks 和回复行为；新增 `Command.dispose()`；插件重载按注册身份清理并保留手动命令。
- 新增 `test/command-core.test.ts`，用同一个纯函数验证两种 Adapter 的离线复用。
- 更新 `docs/development/user-commands.md`、`docs/api/index.md`、`packages/dsh/README.md` 和 `packages/commands/README.md`。
- `el-bot` 的发布 smoke 继续通过 `pnpm pack` 生成 tarball；工作区的 `beforePacking` 钩子只调整 tarball 清单，移除已内联的私有依赖，不改写源码清单。旧启动入口使用公开的已打包框架。

### 首次实现检查

| 检查 | 结果 |
| --- | --- |
| P0 定向命令测试 | 62 项通过；HEAD `3a3260a0` |
| 公共 catalog + 两种 Adapter + 共用业务函数 | 76 项通过 |
| `pnpm test` | 89 个文件、561 项通过 |
| `pnpm lint` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm typecheck:packages` | 通过 |
| `pnpm build` | 通过 |
| `pnpm docs:build` | 通过 |
| `pnpm test:cli` | 通过；隔离安装后的 framework/Nest/CLI、命令类型和打包声明可用 |

### 发布产物

- `el-bot` 与 `@el-bot/dsh` 的源清单均声明 `@el-bot/commands: workspace:*`；tsdown 将公共实现内联到各自产物。
- 隔离安装检查确认发布清单不含 `@el-bot/commands`、`catalog:` 或 `workspace:`，`dist/*.d.mts` 不引用私有包。
- 没有运行真实机器人连接、没有访问 QQ 后台面板、没有部署、没有发送真实 QQ 消息。代码按用户后续授权，在独立提交验证通过后合入主线。

### 遗留

- QQ 后台面板在线同步、群管理员只读权限、命令语法扩展和更多旧插件迁移仍按原计划另行实施。
- `Command.children` 恢复同一 catalog 的实时 Map 语义，保留缓存引用、写入、删除、清空及实时迭代；经 Map 注册的插件命令也按注册身份参与重载清理。
- 发布使用 pnpm 的 [beforePacking 钩子](https://pnpm.io/pnpmfile#hooksbeforepackingpkg-dir-context-pkg--promisepkg)，移除原先的源码清单备份与恢复脚本，打包中断后不需要覆盖源码来恢复。

### Review 修复验证

- 已先运行新增回归用例，确认快照 Map 和未打包 legacy 导入使测试失败，再修复。
- 新增原始 Map 写入、缓存引用、实时迭代、旧 disposer、插件清理及公开框架启动的离线回归。
- 新增发布清单钩子测试，确认原始对象和后续版本修改不受影响。
- tarball smoke 增加源码清单逐字节不变检查，并执行真实 legacy 启动入口，到专用配置文件主动抛出验收标记为止；该配置在 Bot 创建前终止，不建立真实连接。
- 独立检出基于 origin/main 的 53359c8，只包含本轮命令改动；DSH 接入保留主线已有的 qq-security 路径，未把其他任务正在进行的目录迁移或客户端修改带入提交。
- 独立检出全仓测试为 91 个文件、569 项通过；pnpm lint、pnpm build、pnpm typecheck、pnpm typecheck:packages、pnpm docs:build、pnpm test:cli 均通过。
- 首次并发执行两套类型检查时，临时检出的 NSH 下载缓存出现竞争；复用已校验版本的工具链串行重跑 typecheck 后通过，未修改相关源码或减少检查范围。
