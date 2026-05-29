# Foldim

一个轻量级 Windows 桌面终端管理工具，基于 Electron + xterm.js + node-pty 构建。

选择一个项目文件夹，浏览目录结构，双击即可在内嵌终端中打开对应路径 — 无需在文件管理器和终端之间来回切换。

## 功能特性

- **文件夹浏览** — 左侧目录树展示子文件夹结构，按使用频率排序
- **内嵌终端** — 双击文件夹直接打开终端，支持多标签页管理（最多 20 个）
- **多终端类型** — 支持 CMD、PowerShell、Git Bash、Windows Terminal，一键切换
- **NPM 脚本面板** — 自动识别 package.json 中的 scripts，点击即执行
- **Node 版本管理** — 显示当前 Node 版本，集成 nvm 版本列表，双击切换
- **Portable 友好** — 所有配置存储在应用目录内，解压即用，无需安装
- **记忆常用目录** — 记录文件夹打开次数，常用目录自动排在前面

## 截图

<!-- 在此添加应用截图 -->

## 快速开始

### 下载使用

从 [Releases](../../releases) 页面下载最新的 zip 包，解压后双击 `Foldim.exe` 即可运行。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Luxiaoren/foldim.git
cd foldim

# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建打包
npm run build
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 终端渲染 | xterm.js + WebGL 加速 |
| 伪终端 | node-pty |
| 构建工具 | electron-vite + Vite |
| 打包工具 | electron-builder |
| UI | 原生 HTML/CSS/JS（无框架） |

## 项目结构

```
src/
├── main/           # 主进程
│   ├── index.ts              # 应用入口、生命周期管理
│   ├── config-manager.ts     # 配置持久化
│   ├── file-system-service.ts # 文件系统操作
│   ├── pty-manager.ts        # 伪终端管理
│   ├── window-manager.ts     # 窗口状态管理
│   ├── terminal-type-resolver.ts # 终端类型检测
│   └── ipc-handlers.ts       # IPC 通信处理
├── preload/        # Preload 脚本（contextBridge）
├── renderer/       # 渲染进程
│   ├── pages/                # 页面（welcome + workspace）
│   └── components/           # UI 组件
│       ├── directory-tree    # 目录树
│       ├── terminal-panel    # 终端面板
│       ├── tab-bar           # 标签栏
│       ├── layout-manager    # 布局管理
│       ├── script-panel      # NPM 脚本 + Node 版本
│       └── terminal-type-selector # 终端类型选择
└── shared/         # 共享类型和常量
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+O` | 打开文件夹 |
| `` Ctrl+` `` | 切换终端面板显隐 |
| `Ctrl+Q` | 退出应用 |

## 配置

配置文件位于应用目录下的 `config/settings.json`，包含：

- 默认终端类型
- 各终端可执行文件路径
- 最近打开的文件夹列表
- 窗口位置和大小
- 文件夹使用频率统计

## 系统要求

- Windows 10 及以上
- 无需管理员权限

## 开发

```bash
# 开发模式（自动热重载）
npm run dev

# 运行测试
npm run test

# 构建生产版本
npm run build

# 打包为 zip
npm run pack
```

## License

MIT
