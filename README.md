# dsh-better-sidebar-controller

The model control extension for better-sidebar. Version 0.3.0 targets DSH desktop 0.2.0-rc.2 and better-sidebar 0.25.0. It provides 12 gated tools, including better_sidebar_open for files, folder windows and HTTP(S) pages.

Enable the upstream model opening switch in Settings → Side cards, then enable controller management when needed. Both switches default off. The bundled sidebar-controller skill prefers the enhanced opening tool and explains queueing, confirmation timeouts and session isolation.

[中文说明](README.zh-CN.md) · [Agent usage guide](docs/usage.md) · [Tool reference](docs/tools.md) · [Specification](docs/SPEC.md) · [Architecture](docs/architecture.md) · [Verification](docs/VERIFICATION-0.3.0.md).

The internal sidebarController state service remains available with model tools disabled. Daily desktop installation is separate from source delivery; no web environment is started automatically.

Development: npm run typecheck, npm test, npm run build. Built lib artifacts are tracked.
