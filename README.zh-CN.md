# dsh-better-sidebar-controller

better-sidebar 的模型控制增强扩展，源码独立，功能和配置依赖 better-sidebar。版本 0.3.0 面向 DSH desktop 0.2.0-rc.2 与 better-sidebar 0.25.0；验证范围见 [交付记录](docs/VERIFICATION-0.3.0.md)。

在「设置 → 侧边卡片」开启常规的“为模型注入侧边栏打开工具”，并按需要开启“Sidebar Controller 增强控制 → 允许模型管理侧边栏”。两个开关默认关闭；已有上游设置、目录列举设置及未知字段保留。

对 Agent 说：“用 sidebar-controller 技能打开 docs/会议纪要.md”“打开 https://example.com”“现在打开的是哪个文件？”“回到刚才那个文件”。增强打开支持文件、文件夹窗口、网页及工作区外绝对路径。管理工具需要管理开关，返回上一文件需要两个开关。

- [Agent 使用指南：12 个工具、启用步骤、自然语言示例和完整流程](docs/usage.md)
- [工具参考](docs/tools.md) · [捆绑技能](skills/sidebar-controller/SKILL.md)
- [当前功能规格](docs/SPEC.md) · [技术契约](docs/architecture.md)

工具返回 `{ ok, code, message, ... }`。QUEUED 表示等待调用会话界面接入；超时先查询状态，避免重复打开。网页标签打开不保证加载成功。上游 sidebar_open 同时可用时，技能优先使用 better_sidebar_open。

安装使用 desktop 的插件管理入口或仓库隔离验证流程，不使用旧 web 命令。技能随插件自动注册；本机日常未自动启用。内部 sidebarController 服务保留供讨论工作台读取，模型工具关闭后仍同步文件状态。

开发验证：`npm run typecheck`、`npm test`、`npm run build`；lib 是跟踪产物。按 [维护约定](AGENTS.md)先确认文档再实施，独立提交，不自动推送。
