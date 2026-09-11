# dsh-better-sidebar-controller

> 让 Agent 用自然语言控制 better-sidebar 文件工作区的 DSH 插件
> （State → Bridge → Tools → Skill 四层架构，鼠标与 Agent 共用同一份状态）。

`dsh-better-sidebar-controller` 是 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
的 **Agent 控制层**：它不重新实现文件树、标签页或编辑器 UI，而是通过一组稳定的小工具与一份
Skill，把 better-sidebar 的既有能力暴露给 DSH Agent——用户说“打开今天的会议纪要”“切到项目计划”
“回到刚才那个文件”“展开 docs”，Agent 就能驱动侧边栏，且与用户用鼠标操作看到的状态完全一致。

## 定位

| | |
| --- | --- |
| 与 better-sidebar 的关系 | **控制层**，复用其文件树 / 标签页 / 编辑器能力；不修改其核心代码 |
| 工作方式 | 自然语言 → Skill → 11 个明确小工具 → 桥（WebSocket）→ better-sidebar 服务 |
| 状态模型 | `current_file` / `previous_file` / `sidebar_visible` / `opened_files` / `expanded_folders` / `workspace_root`，每会话独立维护，鼠标与 Agent 双向同步 |
| 形态 | 双半插件（host 半挂工具与桥；client 半在浏览器内操作 better-sidebar），`cordis.patch.yml` bundle 发布 |
| 软依赖 | better-sidebar 未安装时插件照常加载，写操作返回 `QUEUED`，状态查询返回 `SIDEBAR_UNAVAILABLE` |

## 安装

前置：DSH 0.1.2-rc.1+ 与 dsh-better-sidebar v0.18+。

```bash
# 安装到目标 profile（示例：web）
dsh plugin --profile web add dsh-better-sidebar-controller@latest

# 复制 Skill 到该 profile 的 skills 目录，让 Agent 学会自然语言 → 工具
# 目标：<dshHome>/profiles/web/.dsh/skills/sidebar-controller/SKILL.md
```

## 工具列表（11 个）

| 工具 | 作用 | 典型自然语言 |
| --- | --- | --- |
| `get_sidebar_state` | 侧边栏/工作区状态（当前文件、上一文件、已打开文件、已展开文件夹…） | “我现在打开的是哪个文件” |
| `show_sidebar` / `hide_sidebar` | 打开 / 隐藏侧边栏 | “打开侧边栏” / “把侧边栏关掉” |
| `list_files` | 列出目录内容（单层） | “看看有哪些文件” |
| `expand_folder` / `collapse_folder` | 展开 / 收起文件夹 | “展开 docs” / “收起 node_modules” |
| `refresh_tree` | 刷新文件树 | “刷新文件树” |
| `open_file` | 打开文件（已打开则激活） | “打开今天的会议纪要” |
| `close_file` | 关闭文件（省略 path 则关当前文件） | “关闭当前文件” |
| `activate_file` | 切换到已打开的文件 | “切到项目计划” |
| `reopen_previous_file` | 回到上一个文件 | “回到刚才那个文件” |

每个工具都返回结构化结果 `{ ok, code, message, ... }` 与明确错误码；完整参考见
[docs/tools.md](docs/tools.md)。

## 快速上手

```
你：帮我看看现在打开了哪些文件
Agent：get_sidebar_state → 当前文件 meeting.md；已打开：[meeting.md, plan.md]

你：切到项目计划
Agent：activate_file(path: "plan.md") → 文件已激活

你：回到刚才那个文件
Agent：reopen_previous_file() → 已打开 meeting.md
```

更多自然语言示例与状态行为说明见 [docs/usage.md](docs/usage.md)。

## 架构

```
自然语言 → DSH Agent → Skill → Tools(host) → Bridge(WS) → better-sidebar(client) → 文件树/标签页
                                        ↑ 状态回推（鼠标与 Agent 共用同一份状态）
```

详见 [docs/architecture.md](docs/architecture.md)，包括桥接协议、投递/重放语义、
current/previous 推导规则、以及接入 better-sidebar 时的设计决策记录
（anchor 标签、QUEUED 语义、会话作用域、上游扩展建议）。

## 开发

```bash
npm install
npm run typecheck   # tsc 类型检查
npm run test        # vitest（117 个用例：推导/协议/桥/路径/工具/集成/挂载/Skill 契约）
npm run build       # host 半 tsc 编译 + client 半 tsdown 浏览器 bundle
npm pack            # 发布前自验（先跑 build）
```

模块边界与测试策略见 [docs/architecture.md](docs/architecture.md)。

## 当前限制

- 显隐 / 展开 / 收起作用于**当前可见**的侧边栏（`panelOpen` / `expanded` 是活动会话单份状态）。
- 标签条上存在一个空的 anchor 标签（获取 store 的最小侵入方案，详见架构文档决策 D1）。
- 不含 Structured Document 节点操作与语音输入（需求预留，当前版本不实现）。

## 许可

[MIT](LICENSE)
