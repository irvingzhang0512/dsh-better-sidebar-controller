**English** | [简体中文](README.zh-CN.md)

# dsh-better-sidebar-controller

**The Agent control layer for [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar).**

It does not reimplement the file tree, tabs, or editor UI. Instead, it exposes better-sidebar's existing capabilities through a stable set of eleven small tools and one bundled skill, so the DSH Agent can drive the sidebar file workspace with natural language — *"open today's meeting notes"*, *"switch to the project plan"*, *"go back to the previous file"*, *"expand docs"* — while sharing exactly the same state the user sees from mouse interactions.

## Features

- **11 focused tools, no kitchen-sink command tool** — `get_sidebar_state`, `show_sidebar` / `hide_sidebar`, `list_files`, `expand_folder` / `collapse_folder`, `refresh_tree`, `open_file`, `close_file`, `activate_file`, `reopen_previous_file`. Each tool is small and single-purpose; there is deliberately no catch-all `workspace(action)` tool.
- **Consistent structured results** — every tool returns one canonical envelope `{ ok, code, message, ... }` plus tool-specific fields, with explicit error codes (`OK`, `QUEUED`, `SIDEBAR_UNAVAILABLE`, `PATH_OUTSIDE_WORKSPACE`, `FILE_NOT_OPEN`, `NO_PREVIOUS_FILE`, …). Business failures come back as structured results rather than throws, so the model always gets a machine-readable answer.
- **Two-way state sync** — mouse and Agent operations share one state, maintained per session: `current_file`, `previous_file`, `opened_files`, `expanded_folders`, `sidebar_visible`, `workspace_root`. What the Agent sees is what the user sees, in both directions.
- **Install plugin = install skill** — the host half self-registers the bundled `skills/sidebar-controller/SKILL.md` into `ctx.skills` at mount time, so the skill is available without any manual copy.
- **better-sidebar is a soft dependency** — the host mounts regardless. Until a session's sidebar client attaches, write tools return `QUEUED` (the command is queued and auto-applies when the sidebar becomes visible) and `get_sidebar_state` reports `SIDEBAR_UNAVAILABLE`.
- **Zero core modifications** — integration goes through public APIs only: a hidden anchor tab (public `registerTab`) plus `service.openFile` / `closeTab` / `activateTab`.
- **The anchor tab never hijacks your view** — it is opened in the background: it is minted at most once per page load (the store capture is global) and the previously active tab is restored immediately after opening, so the user's active view is never stolen.

## Installation

Prerequisites: [DSH](https://github.com/omdsh-dev/DSH) 0.1.2-rc.1+ (for skill self-registration) and [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) v0.18+ (install it first — it is the thing this plugin controls).

From the npm registry (release):

```bash
dsh plugin --profile web add dsh-better-sidebar-controller@latest
```

Or straight from GitHub (no npm account needed; the prebuilt `lib/` is committed):

```bash
dsh plugin --profile web add "github:irvingzhang0512/dsh-better-sidebar-controller"
```

Either command installs the plugin **and** its skill in one step: the host half registers `skills/sidebar-controller/SKILL.md` into the DSH skill registry (`ctx.skills`) when it mounts, so the `sidebar-controller` skill shows up in the Agent's skill list automatically.

> **Fallback for older DSH:** if the runtime has no `ctx.skills` (before 0.1.2-rc.1), copy the skill manually:
> `cp skills/sidebar-controller/SKILL.md <dshHome>/profiles/web/.dsh/skills/sidebar-controller/SKILL.md`

Restart DSH after installing. To uninstall (the skill is removed together with the plugin):

```bash
dsh plugin --profile web remove dsh-better-sidebar-controller
```

## Quick start

Natural language maps straight to tool calls:

| You say | Tool call |
| --- | --- |
| "What file am I on?" / "Which files are open?" | `get_sidebar_state()` |
| "Open the sidebar" | `show_sidebar()` |
| "Hide the sidebar" | `hide_sidebar()` |
| "List the workspace root" / "List the docs folder" | `list_files()` / `list_files(path: "docs")` |
| "Expand docs" | `expand_folder(path: "docs")` |
| "Collapse node_modules" | `collapse_folder(path: "node_modules")` |
| "Refresh the file tree" | `refresh_tree()` |
| "Open today's meeting notes" | `open_file(path: "meeting.md")` |
| "Close the current file" | `close_file()` |
| "Switch to the project plan" | `activate_file(path: "plan.md")` (or `open_file` if not open) |
| "Go back to the previous file" | `reopen_previous_file()` |

## Tools (11)

| Tool | Purpose |
| --- | --- |
| `get_sidebar_state` | Get the sidebar/workspace state: `sidebarVisible`, `currentFile`, `previousFile`, `openedFiles`, `expandedFolders`, `workspaceRoot`. Forces a fresh sync when the client is connected; `state` is `null` when the session's sidebar has never attached. |
| `show_sidebar` / `hide_sidebar` | Show / hide the sidebar panel. |
| `list_files` | List one directory level (`path` optional; defaults to the workspace root). Returns `entries[]` with `name` / `path` / `isDir` / `hidden` / `isSymlink` / `broken`. |
| `expand_folder` / `collapse_folder` | Expand / collapse a folder in the file tree (`path` required; the target must be a directory, else `NOT_A_DIRECTORY`). |
| `refresh_tree` | Re-read the workspace root and reload the expanded directories (e.g. after files were created externally). |
| `open_file` | Open a file; activates it if already open. The target must be a file, else `NOT_A_FILE`. |
| `close_file` | Close a file's tab; without `path` closes the current file (`NO_CURRENT_FILE` when there is none). |
| `activate_file` | Switch to an already-open file's tab (`FILE_NOT_OPEN` if the file is not open). |
| `reopen_previous_file` | Re-open `previous_file` — the file that was current before the current one (`NO_PREVIOUS_FILE` if there is none). |

All `path` arguments resolve relative to the calling session's workspace root (absolute paths are accepted too), are normalized with `realpath`, and are fenced to the workspace — anything outside returns `PATH_OUTSIDE_WORKSPACE`. Every tool returns the `{ ok, code, message, ... }` envelope; the full tool reference and the error-code table live in [docs/tools.md](docs/tools.md).

## Skill

The bundled `sidebar-controller` skill is the Agent-facing side of the plugin: it maps natural language ("open file X", "switch to that file", "go back to the previous file"…) to the eleven tools and encodes the conventions (relative/absolute paths, automatic `current_file` / `previous_file` maintenance, `QUEUED` semantics, retry guidance). The skill is the single source of truth for the natural-language → tool mapping and is self-registered on `ctx.skills` when the plugin mounts — installing the plugin is all you need.

## How it works

```
natural language → DSH Agent → Skill → Tools (host) → Bridge (WebSocket) → better-sidebar (client) → file tree / tabs
                                        ↑ state push-back (mouse and Agent share one state)
```

Four layers:

- **State** — semantic state (`current_file` / `previous_file` / `opened_files` / `expanded_folders` / `sidebar_visible` / `workspace_root`) is derived from every better-sidebar snapshot and mirrored per session on the host. Because the snapshot observes every mouse interaction, user operations and Agent operations share one state.
- **Bridge** — a WebSocket channel (`/sidebar-controller/ws`) between the host and the browser client: command dispatch, ack, state push-back, and queue replay. When a session's sidebar is not visible, write commands are queued (bounded) and replayed on the next attach.
- **Tools** — the eleven focused tools in `src/host/tools.ts`, each returning the structured `{ ok, code, message, ... }` envelope.
- **Skill** — the bundled `sidebar-controller` skill, self-registered on `ctx.skills` at mount time.

The design decisions (D1–D7) are recorded in [docs/architecture.md](docs/architecture.md).

## Documentation

The detailed documentation is written in Chinese:

- [docs/architecture.md](docs/architecture.md) — architecture & design decisions (State → Bridge → Tools → Skill, decisions D1–D7)
- [docs/tools.md](docs/tools.md) — tools & error-code reference
- [docs/usage.md](docs/usage.md) — user guide (examples, state behavior, FAQ)

## License

[MIT](LICENSE)
