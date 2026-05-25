/**
 * IPC 通道常量定义
 * 主进程与渲染进程之间的通信通道名称
 */

/** 终端相关通道 */
export const PTY_CHANNELS = {
  CREATE: 'pty:create',       // 创建伪终端
  WRITE: 'pty:write',        // 向终端写入数据
  RESIZE: 'pty:resize',      // 调整终端尺寸
  CLOSE: 'pty:close',        // 关闭终端
  DATA: 'pty:data',          // 终端输出数据（主进程 → 渲染进程）
  EXIT: 'pty:exit',          // 终端进程退出（主进程 → 渲染进程）
} as const;

/** 文件系统相关通道 */
export const FS_CHANNELS = {
  READDIR: 'fs:readdir',         // 读取子文件夹列表
  CHECK_ACCESS: 'fs:checkAccess', // 检查路径访问权限
  OPEN_DIALOG: 'fs:openDialog',   // 打开文件夹选择对话框
  READ_SCRIPTS: 'fs:readScripts', // 读取 package.json 中的 scripts 字段
  GET_NODE_INFO: 'fs:getNodeInfo', // 获取 node 版本和 nvm 列表
} as const;

/** 配置相关通道 */
export const CONFIG_CHANNELS = {
  GET: 'config:get',             // 获取完整配置
  UPDATE: 'config:update',       // 更新配置
  GET_RECENT: 'config:getRecent', // 获取最近文件夹列表
  ADD_RECENT: 'config:addRecent', // 添加最近文件夹
} as const;

/** 窗口状态相关通道 */
export const WINDOW_CHANNELS = {
  GET_STATE: 'window:getState',   // 获取窗口状态
  SAVE_STATE: 'window:saveState', // 保存窗口状态
} as const;
