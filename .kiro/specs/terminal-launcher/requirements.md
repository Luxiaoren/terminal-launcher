# Requirements Document

## Introduction

Terminal Launcher 是一个轻量级 Windows 桌面工具，基于 Electron + xterm.js + node-pty 技术栈构建。用户可以通过类似 VS Code 的启动页选择文件夹，在左侧目录树中浏览子文件夹，并点击文件夹在应用内嵌终端中打开对应路径的终端会话。支持多种终端类型（cmd、PowerShell、Git Bash、Windows Terminal），目标为免安装/portable 友好的轻量级应用。

## Glossary

- **Application**：Terminal Launcher 桌面应用程序主体
- **Welcome_Page**：应用启动时显示的欢迎页面，提供打开文件夹的入口
- **Directory_Tree**：左侧面板中展示当前已打开文件夹下所有子文件夹的树形结构
- **Embedded_Terminal**：应用内嵌的终端面板，基于 xterm.js 渲染，通过 node-pty 与系统终端进程通信
- **Terminal_Type**：用户可选择的终端类型，包括 cmd、PowerShell、Git Bash、Windows Terminal 等
- **Workspace_Folder**：用户通过欢迎页或菜单选择打开的根文件夹

## Requirements

### Requirement 1: 欢迎页面

**User Story:** 作为用户，我希望在应用启动时看到一个欢迎页面，以便快速选择要打开的文件夹。

#### Acceptance Criteria

1. WHEN Application 启动且未指定 Workspace_Folder, THE Welcome_Page SHALL 显示一个"打开文件夹"按钮
2. WHEN 用户点击"打开文件夹"按钮, THE Application SHALL 在 2 秒内弹出系统原生的文件夹选择对话框
3. WHEN 用户通过对话框选择一个文件夹且该文件夹具有读取权限, THE Application SHALL 将该文件夹设为 Workspace_Folder 并切换到主工作界面
4. WHEN 用户取消文件夹选择对话框, THE Application SHALL 保持在 Welcome_Page 不做任何变化
5. WHEN Welcome_Page 显示时, THE Welcome_Page SHALL 按最近打开时间降序显示最近打开过的文件夹列表，最多显示 10 个条目
6. WHEN 用户点击最近打开列表中的某个可用状态的文件夹, THE Application SHALL 将该文件夹设为 Workspace_Folder 并切换到主工作界面
7. IF 最近打开列表中的某个文件夹路径已不存在, THEN THE Welcome_Page SHALL 将该条目显示为灰色禁用状态且不可点击
8. IF 用户通过对话框选择的文件夹不具有读取权限, THEN THE Application SHALL 保持在 Welcome_Page 并显示错误提示，指明该文件夹无法访问
9. WHEN Welcome_Page 加载时, THE Application SHALL 对最近打开列表中的每个文件夹路径进行存在性检查

### Requirement 2: 目录树展示

**User Story:** 作为用户，我希望在左侧面板看到当前文件夹下的所有子文件夹，以便快速导航到目标目录。

#### Acceptance Criteria

1. WHEN Workspace_Folder 被设定, THE Directory_Tree SHALL 在左侧面板中展示该文件夹下的所有直接子文件夹，单层最多显示 1000 个文件夹条目
2. THE Directory_Tree SHALL 仅显示文件夹，不显示文件
3. WHEN 用户点击 Directory_Tree 中的某个文件夹展开箭头, THE Directory_Tree SHALL 展开该文件夹并显示其下一级子文件夹
4. WHEN 用户点击已展开文件夹的折叠箭头, THE Directory_Tree SHALL 折叠该文件夹并隐藏其子文件夹
5. THE Directory_Tree SHALL 按文件夹名称的字典序（不区分大小写，英文字母优先于中文字符）排列各层级的文件夹
6. IF Directory_Tree 中某个文件夹无法访问（权限不足）, THEN THE Directory_Tree SHALL 将该文件夹显示为灰色不可展开状态，且不显示展开箭头
7. WHILE Workspace_Folder 已设定, THE Directory_Tree SHALL 在面板顶部显示当前 Workspace_Folder 的名称
8. IF 展开的文件夹下不存在任何子文件夹, THEN THE Directory_Tree SHALL 不显示展开箭头，表明该文件夹为叶节点
9. WHEN 用户点击文件夹展开箭头且子文件夹列表加载耗时超过 500 毫秒, THE Directory_Tree SHALL 在该文件夹节点下方显示加载指示器，直到加载完成或失败
10. IF 加载子文件夹列表失败（如 I/O 错误）, THEN THE Directory_Tree SHALL 在该文件夹节点下方显示错误提示信息，并保留该文件夹的可展开状态以允许用户重试

### Requirement 3: 内嵌终端

**User Story:** 作为用户，我希望点击文件夹后能在应用内部打开该文件夹的终端，以便无需切换窗口即可执行命令。

#### Acceptance Criteria

1. WHEN 用户在 Directory_Tree 中双击某个文件夹, THE Application SHALL 在右侧面板中打开一个 Embedded_Terminal，工作目录设为该文件夹的绝对路径
2. IF 用户双击的文件夹路径不存在或无访问权限, THEN THE Application SHALL 显示错误提示信息说明无法在该路径打开终端，且不创建终端标签页
3. THE Embedded_Terminal SHALL 通过 node-pty 创建伪终端进程，并通过 xterm.js 渲染终端界面
4. WHEN 用户在 Embedded_Terminal 中输入命令, THE Embedded_Terminal SHALL 将输入传递给 node-pty 进程并在 500 毫秒内显示输出
5. THE Embedded_Terminal SHALL 支持 ANSI 256 色渲染、光标移动（上下左右）及至少 100 条命令历史记录
6. WHEN 用户打开多个终端, THE Application SHALL 以标签页形式管理最多 20 个 Embedded_Terminal 实例
7. IF 已打开的终端标签页数量达到上限（20 个）, THEN THE Application SHALL 显示提示信息告知用户已达到最大终端数量，拒绝创建新终端
8. WHEN 用户关闭某个终端标签页, THE Application SHALL 终止对应的 node-pty 进程并释放资源
9. WHEN node-pty 进程正常退出（退出码为 0）, THE Embedded_Terminal SHALL 显示进程已结束的提示信息并保留终端输出内容
10. IF node-pty 进程异常退出（退出码非 0 或被信号终止）, THEN THE Embedded_Terminal SHALL 显示包含退出码的进程异常退出提示信息，并提供重新启动按钮

### Requirement 4: 终端类型支持

**User Story:** 作为用户，我希望能选择不同的终端类型（cmd、PowerShell、Git Bash 等），以便使用我习惯的命令行环境。

#### Acceptance Criteria

1. THE Application SHALL 支持以下 Terminal_Type：cmd、PowerShell、Git Bash、Windows Terminal，支持定义为能够启动对应终端进程并在应用内提供可交互的命令行界面
2. WHEN 用户打开新终端, THE Application SHALL 使用用户设定的默认 Terminal_Type 启动终端；IF 用户未设定默认 Terminal_Type, THEN THE Application SHALL 使用 cmd 作为默认终端类型
3. THE Application SHALL 提供终端类型选择下拉菜单，菜单中列出所有已配置的 Terminal_Type，并标识当前系统中不可用的终端类型（灰显或标注不可用状态），允许用户在打开终端时选择可用的 Terminal_Type
4. WHEN 用户选择 Git Bash 作为 Terminal_Type, THE Application SHALL 自动检测 Git Bash 的安装路径；IF 自动检测未找到 Git Bash, THEN THE Application SHALL 提示用户手动指定 Git Bash 可执行文件路径
5. IF 用户选择的 Terminal_Type 在系统中未安装或配置的可执行文件路径无效, THEN THE Application SHALL 在 3 秒内显示错误提示信息，告知用户该终端类型不可用及具体原因（未安装或路径无效），且不打开空白或异常终端窗口
6. THE Application SHALL 提供设置界面，允许用户配置默认 Terminal_Type 和各终端类型的可执行文件路径；WHEN 用户保存路径配置时, THE Application SHALL 验证所配置的可执行文件路径是否存在且可执行，IF 路径无效, THEN THE Application SHALL 显示验证失败提示并阻止保存
7. WHEN 用户修改默认 Terminal_Type 设置并保存成功, THE Application SHALL 将配置持久化保存，下次启动应用时自动加载该配置；IF 配置保存失败, THEN THE Application SHALL 显示错误提示信息并保留用户当前的修改内容以便重试
8. WHEN 终端启动过程超过 10 秒未完成, THE Application SHALL 终止启动过程并显示超时错误提示信息，告知用户终端启动失败

### Requirement 5: 应用打包与分发

**User Story:** 作为用户，我希望应用是免安装的 portable 版本，以便直接解压即可使用，无需管理员权限。

#### Acceptance Criteria

1. THE Application SHALL 支持打包为 portable 格式（zip 压缩包），解压到任意目录后双击主程序可执行文件即可启动，无需运行安装程序或写入系统注册表
2. THE Application SHALL 将所有用户配置文件存储在应用目录下的 config 子文件夹中，而非系统用户目录或 AppData 目录
3. IF config 子文件夹不存在, THEN THE Application SHALL 在启动时自动创建该文件夹并写入默认配置
4. THE Application SHALL 在 Windows 10 及以上版本的操作系统上，以普通用户权限（无需管理员 UAC 提升）启动并正常提供所有功能
5. THE Application SHALL 打包后总体积不超过 200MB（含 Electron 运行时），且所有运行时依赖均包含在 zip 包内，无需用户额外下载或安装任何第三方运行时组件
6. WHEN Application 首次启动, THE Application SHALL 在 10 秒内完成初始化并显示主界面，无需任何额外安装步骤或网络连接
7. IF 应用所在目录为只读权限导致无法写入配置文件, THEN THE Application SHALL 显示错误提示信息，告知用户需要对应用目录具有写入权限

### Requirement 6: 窗口布局

**User Story:** 作为用户，我希望应用界面布局清晰合理，以便高效地在目录树和终端之间切换操作。

#### Acceptance Criteria

1. THE Application SHALL 采用左右分栏布局：左侧为 Directory_Tree 面板，右侧为 Embedded_Terminal 面板，默认宽度比例为左侧 30%、右侧 70%
2. THE Application SHALL 提供可拖拽的分隔条，允许用户调整左右面板的宽度比例，且任一面板的最小宽度不得小于窗口总宽度的 15%
3. WHILE 未打开任何 Embedded_Terminal, THE Application SHALL 在右侧面板居中显示提示文字，引导用户双击文件夹打开终端
4. WHEN Application 启动时, THE Application SHALL 恢复用户上次关闭时的窗口大小和位置
5. IF 上次保存的窗口位置或大小超出当前屏幕可用范围, THEN THE Application SHALL 以默认大小（1024×768）居中显示在主屏幕上
6. WHEN 用户按下 Ctrl+` 快捷键, THE Application SHALL 切换 Embedded_Terminal 面板的显示和隐藏状态，隐藏时 Directory_Tree 面板扩展至全部宽度，显示时恢复至隐藏前的分栏比例
