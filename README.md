# Foldim

一个轻量级 Windows 桌面终端管理工具，基于 Electron + xterm.js + node-pty 构建。

选择一个项目文件夹，浏览目录结构，单击展开、双击即可在内嵌终端中打开对应路径 — 无需在文件管理器和终端之间来回切换。

> ⚠️ **平台说明**：Foldim 目前是为 **Windows** 设计并验证的应用。作者**没有在 macOS 上实际构建或运行过**，仓库中的 macOS 打包配置仅供参考，直接打出的 mac 包终端功能不可用，需要先做代码适配（详见下文「在 macOS 上构建」）。

## 功能特性

- **文件夹浏览** — 左侧目录树展示子文件夹结构，按使用频率排序
- **单击展开 / 双击打开** — 单击文件夹行展开或折叠，双击直接打开终端
- **实时排序刷新** — 打开文件夹后目录树立即按使用频率重排，无需重启
- **内嵌终端** — 双击文件夹直接打开终端，支持多标签页管理（最多 20 个）
- **多终端类型** — 支持 CMD、PowerShell、Git Bash、Windows Terminal，一键切换
- **NPM 脚本面板** — 自动识别 package.json 中的 scripts，点击即执行
- **Node 版本管理** — 显示当前 Node 版本，集成 nvm 版本列表，双击切换
- **三列自适应布局** — 目录树 / 终端 / 脚本面板，分隔条可拖拽调整，宽度之和撑满窗口
- **Portable 友好** — 所有配置存储在应用目录内，解压即用，无需安装
- **记忆常用目录** — 记录文件夹打开次数，常用目录自动排在前面

## 环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 及以上（macOS 需自行适配，见下文） |
| Node.js | **>= 18，推荐 v20 或 v22** |
| 包管理器 | npm |

> ⚠️ **Node 版本注意**：构建工具链（Vite 5 / electron-vite）使用了 `||=` 等较新语法，**Node 14 / 16 会构建失败**（报 `Unexpected token '||='`）。如使用 nvm，请先切换到受支持版本：
> ```bash
> nvm use 22
> node -v   # 确认 >= 18
> ```

## 快速开始

### 下载使用

从 [Releases](../../releases) 页面下载最新的 zip 包，解压后双击 `Foldim.exe` 即可运行。

### 从源码运行

```bash
# 克隆仓库
git clone https://github.com/Luxiaoren/foldim.git
cd foldim

# 安装依赖（会自动编译 node-pty 原生模块）
npm install

# 开发模式（热重载）
npm run dev
```

## 开发与测试

```bash
# 开发模式（自动热重载，启动后打开 DevTools）
npm run dev

# 运行测试（单元 + 属性 + 集成测试，共 100+ 用例）
npm run test

# 监听模式运行测试
npm run test:watch

# 仅编译（输出到 out/ 目录，不打包）
npm run build

# 预览生产构建
npm run preview
```

## 构建与打包

打包前会先执行 `npm run build` 编译源码到 `out/` 目录，再由 electron-builder 把 `out/`、依赖、`config/` 等资源打成安装包。打包产物输出到 `dist/` 目录。

| 命令 | 说明 | 产物 |
|------|------|------|
| `npm run build` | 仅编译 TypeScript / 前端资源到 `out/` | `out/**` |
| `npm run pack` | 按当前系统默认目标打包 | `dist/**` |
| `npm run pack:win` | 打包 Windows x64 zip | `dist/Foldim-<版本>-win.zip` |
| `npm run pack:mac` | 打包 macOS dmg + zip（x64 / arm64）| `dist/Foldim-<版本>*.dmg` 等 |
| `npm run pack:dir` | 仅生成解压目录（调试用，不压缩） | `dist/*-unpacked/` |

### 在 Windows 上构建（已验证）

```bash
nvm use 22          # 确保 Node >= 18
npm install
npm run build
npm run pack:win
```

产物：`dist/Foldim-1.0.0-win.zip`（便携版）和 `dist/win-unpacked/Foldim.exe`（解压即用）。

应用图标取自 `build/icon.png`（≥256×256 的 PNG），electron-builder 会在打包时自动转换为 Windows 所需的 ico，无需手动准备 ico 文件。

### 在 macOS 上构建（⚠️ 未验证，需先适配代码）

> **重要前提**
> 1. **mac 包必须在 macOS 上构建**。`node-pty` 是原生模块，dmg 制作依赖 macOS 系统工具（`hdiutil`），无法在 Windows 上交叉编译出可用的 mac 包。
> 2. 作者**没有在 mac 上跑过**，下面的步骤和需要修改的代码点是基于源码分析给出的指引，实际可能还需调试。

打包命令（在 macOS 上执行）：

```bash
nvm use 22
npm install        # 在 macOS 上重新编译 node-pty
npm run build
npm run pack:mac
```

#### macOS 适配需要修改的代码点

当前终端相关逻辑是 Windows 专属的（硬编码了 `cmd.exe`、`bash.exe` 路径等），直接在 mac 上运行会因为找不到 shell 而无法打开终端。要让 mac 版真正可用，至少需要改动以下位置：

1. **`src/shared/types.ts` — 终端类型定义**
   - `TerminalType` 目前是 `'cmd' | 'powershell' | 'gitbash' | 'windowsTerminal'`，需要新增 mac 常见类型，如 `'bash' | 'zsh'`。
   - `TerminalPaths` 接口同步增加对应字段。

2. **`src/main/config-manager.ts` — 默认终端路径**
   - `DEFAULT_TERMINAL_PATHS` 全是 Windows 路径。需要按平台区分，mac 下默认值类似：
     ```ts
     // macOS 示例
     { zsh: '/bin/zsh', bash: '/bin/bash' }
     ```
   - `defaultTerminalType` 在 mac 下应为 `zsh`（macOS 默认 shell）。

3. **`src/renderer/pages/workspace.ts` — `getDefaultShell()`**
   - 该函数把终端类型映射到 `cmd.exe` / `powershell.exe` / `wt.exe` 等 Windows 可执行文件，需要按 `process.platform` 返回 mac 下的 shell 路径（`/bin/zsh`、`/bin/bash`）。

4. **`src/main/terminal-type-resolver.ts` — 路径检测**
   - `GIT_BASH_KNOWN_PATHS`、注册表查询（`reg query`）、`bash.exe` 搜索等都是 Windows 专属逻辑，需要为 mac 增加分支（mac 上 shell 通常在 `/bin`、`/usr/bin`，且无注册表）。

5. **`src/renderer/components/tab-bar.ts` — 终端类型图标**
   - `TERMINAL_TYPE_ICONS` 映射需为新增的 mac 终端类型补充图标。

6. **窗口/菜单（可选）**
   - `src/main/index.ts` 中的菜单快捷键使用 `CmdOrCtrl`，Electron 会自动适配 mac 的 ⌘ 键，一般无需改动；如需 mac 风格菜单（应用名菜单等）可另行调整。

建议改造方式：抽出一个"平台适配层"，根据 `process.platform`（`'win32'` / `'darwin'`）返回对应的默认终端类型、shell 路径和检测逻辑，避免在多处散落平台判断。

## 技术栈

| 组件 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 终端渲染 | xterm.js + WebGL 加速 |
| 伪终端 | node-pty |
| 构建工具 | electron-vite + Vite 5 |
| 打包工具 | electron-builder |
| 测试 | Vitest + fast-check（属性测试） |
| UI | 原生 HTML/CSS/JS（无框架） |

## 项目结构

```
src/
├── main/           # 主进程
│   ├── index.ts                  # 应用入口、生命周期管理、资源清理
│   ├── config-manager.ts         # 配置持久化（含默认终端路径）
│   ├── file-system-service.ts    # 文件系统操作
│   ├── pty-manager.ts            # 伪终端管理
│   ├── window-manager.ts         # 窗口状态管理
│   ├── terminal-type-resolver.ts # 终端类型检测（Windows 专属逻辑）
│   └── ipc-handlers.ts           # IPC 通信处理
├── preload/        # Preload 脚本（contextBridge）
├── renderer/       # 渲染进程
│   ├── pages/                    # 页面（welcome + workspace）
│   └── components/               # UI 组件
│       ├── directory-tree        # 目录树（单击展开 / 双击打开 / 实时排序）
│       ├── terminal-panel        # 终端面板
│       ├── tab-bar               # 标签栏
│       ├── layout-manager        # 三列布局管理
│       ├── script-panel          # NPM 脚本 + Node 版本
│       └── terminal-type-selector # 终端类型选择
└── shared/         # 共享类型和工具
    ├── types.ts                  # 共享类型定义
    ├── ipc-channels.ts           # IPC 通道常量
    └── sort-utils.ts             # 文件夹排序（主/渲染进程共享）
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+O` | 打开文件夹 |
| `` Ctrl+` `` | 切换终端面板显隐 |
| `F12` | 切换开发者工具 |
| `Ctrl+Q` | 退出应用 |

## 配置

配置文件位于应用目录下的 `config/settings.json`，包含：

- 默认终端类型
- 各终端可执行文件路径
- 最近打开的文件夹列表
- 窗口位置和大小
- 布局比例与终端面板显隐
- 文件夹使用频率统计

## License

MIT
