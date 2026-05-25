/**
 * 终端类型检测与路径管理模块
 *
 * 负责：
 * - 各终端类型的可执行文件路径解析
 * - Git Bash 路径自动检测（按优先级检测多个路径和注册表）
 * - 终端类型可用性检查（验证可执行文件路径是否存在且可执行）
 * - 默认终端类型配置读取
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { TerminalType, TerminalPaths } from '../shared/types';

/**
 * 终端可用性检查结果
 */
export interface TerminalAvailability {
  available: boolean;       // 是否可用
  resolvedPath: string;     // 解析后的实际路径
  reason?: string;          // 不可用时的原因说明
}

/**
 * 文件存在性检查函数类型（用于依赖注入，便于测试）
 */
export type FileExistsChecker = (filePath: string) => boolean;

/**
 * 命令执行函数类型（用于依赖注入，便于测试）
 */
export type CommandExecutor = (command: string) => string;

/**
 * PATH 环境变量搜索函数类型（用于依赖注入，便于测试）
 */
export type PathSearcher = (executable: string) => string | null;

/**
 * 依赖注入选项，便于单元测试
 */
export interface TerminalTypeResolverDeps {
  fileExists?: FileExistsChecker;
  execCommand?: CommandExecutor;
  searchInPath?: PathSearcher;
  envPath?: string;
}

/**
 * Git Bash 已知安装路径（按优先级排列）
 */
const GIT_BASH_KNOWN_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

/**
 * Git Bash 注册表查询键
 */
const GIT_BASH_REGISTRY_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows';
const GIT_BASH_REGISTRY_VALUE = 'InstallPath';

/**
 * TerminalTypeResolver - 终端类型检测与路径管理
 *
 * 提供终端可执行文件路径解析、Git Bash 自动检测、
 * 终端可用性验证等功能。支持依赖注入以便于测试。
 */
export class TerminalTypeResolver {
  private fileExists: FileExistsChecker;
  private execCommand: CommandExecutor;
  private searchInPath: PathSearcher;

  constructor(deps?: TerminalTypeResolverDeps) {
    // 使用注入的依赖或默认实现
    this.fileExists = deps?.fileExists ?? defaultFileExists;
    this.execCommand = deps?.execCommand ?? defaultExecCommand;
    this.searchInPath = deps?.searchInPath ?? ((executable: string) => {
      return defaultSearchInPath(executable, deps?.envPath);
    });
  }

  /**
   * 解析终端可执行文件的实际路径
   *
   * 根据终端类型和用户配置的路径，返回最终应使用的可执行文件路径。
   * - cmd/powershell/windowsTerminal：优先使用配置路径，若为默认值则直接返回
   * - gitbash：若配置路径有效则使用，否则执行自动检测
   *
   * @param type 终端类型
   * @param configuredPaths 用户配置的各终端路径
   * @returns 解析后的可执行文件路径，若无法解析返回 null
   */
  resolveShellPath(type: TerminalType, configuredPaths: TerminalPaths): string | null {
    const configuredPath = configuredPaths[type];

    switch (type) {
      case 'cmd':
        // cmd.exe 通常在系统 PATH 中，直接使用配置路径
        return configuredPath || 'cmd.exe';

      case 'powershell':
        // powershell.exe 通常在系统 PATH 中，直接使用配置路径
        return configuredPath || 'powershell.exe';

      case 'windowsTerminal':
        // wt.exe 通常在系统 PATH 中，直接使用配置路径
        return configuredPath || 'wt.exe';

      case 'gitbash':
        return this.resolveGitBashPath(configuredPath);

      default:
        return null;
    }
  }

  /**
   * 检查指定终端类型在给定路径下是否可用
   *
   * 验证可执行文件路径是否存在且可执行。
   * 对于系统 PATH 中的命令（如 cmd.exe），通过 where 命令验证。
   * 对于绝对路径，直接检查文件是否存在。
   *
   * @param type 终端类型
   * @param shellPath 可执行文件路径
   * @returns 可用性检查结果
   */
  checkAvailability(type: TerminalType, shellPath: string): TerminalAvailability {
    if (!shellPath) {
      return {
        available: false,
        resolvedPath: '',
        reason: `终端类型 ${type} 未配置可执行文件路径`,
      };
    }

    // 如果是绝对路径，直接检查文件是否存在
    if (path.isAbsolute(shellPath)) {
      if (this.fileExists(shellPath)) {
        return { available: true, resolvedPath: shellPath };
      }
      return {
        available: false,
        resolvedPath: shellPath,
        reason: `可执行文件不存在: ${shellPath}`,
      };
    }

    // 非绝对路径（如 cmd.exe），在 PATH 中搜索
    const foundPath = this.searchInPath(shellPath);
    if (foundPath) {
      return { available: true, resolvedPath: foundPath };
    }

    return {
      available: false,
      resolvedPath: shellPath,
      reason: `在系统 PATH 中未找到可执行文件: ${shellPath}`,
    };
  }

  /**
   * 检查所有终端类型的可用性
   *
   * @param configuredPaths 用户配置的各终端路径
   * @returns 各终端类型的可用性映射
   */
  checkAllAvailability(configuredPaths: TerminalPaths): Record<TerminalType, TerminalAvailability> {
    const types: TerminalType[] = ['cmd', 'powershell', 'gitbash', 'windowsTerminal'];
    const result = {} as Record<TerminalType, TerminalAvailability>;

    for (const type of types) {
      const resolvedPath = this.resolveShellPath(type, configuredPaths);
      if (resolvedPath) {
        result[type] = this.checkAvailability(type, resolvedPath);
      } else {
        result[type] = {
          available: false,
          resolvedPath: '',
          reason: `无法解析终端类型 ${type} 的可执行文件路径`,
        };
      }
    }

    return result;
  }

  /**
   * 获取默认终端类型
   *
   * 从配置中读取默认终端类型，若未配置则返回 'cmd'。
   *
   * @param configuredDefault 配置中的默认终端类型
   * @returns 有效的终端类型
   */
  getDefaultTerminalType(configuredDefault?: TerminalType): TerminalType {
    const validTypes: TerminalType[] = ['cmd', 'powershell', 'gitbash', 'windowsTerminal'];
    if (configuredDefault && validTypes.includes(configuredDefault)) {
      return configuredDefault;
    }
    // 未设定或无效值时，使用 cmd 作为默认终端类型
    return 'cmd';
  }

  /**
   * 自动检测 Git Bash 安装路径
   *
   * 按以下优先级依次检测：
   * 1. C:\Program Files\Git\bin\bash.exe
   * 2. C:\Program Files (x86)\Git\bin\bash.exe
   * 3. 环境变量 PATH 中搜索 bash.exe
   * 4. 注册表 HKEY_LOCAL_MACHINE\SOFTWARE\GitForWindows 的 InstallPath 值
   *
   * @returns 检测到的 Git Bash 路径，未找到返回 null
   */
  detectGitBashPath(): string | null {
    // 优先级 1 & 2：检查已知安装路径
    for (const knownPath of GIT_BASH_KNOWN_PATHS) {
      if (this.fileExists(knownPath)) {
        return knownPath;
      }
    }

    // 优先级 3：在 PATH 环境变量中搜索 bash.exe
    const pathResult = this.searchInPath('bash.exe');
    if (pathResult) {
      return pathResult;
    }

    // 优先级 4：查询 Windows 注册表
    const registryPath = this.queryGitBashFromRegistry();
    if (registryPath) {
      return registryPath;
    }

    return null;
  }

  /**
   * 解析 Git Bash 可执行文件路径
   *
   * 如果配置路径有效（文件存在），直接使用配置路径。
   * 否则执行自动检测。
   *
   * @param configuredPath 用户配置的 Git Bash 路径
   * @returns 解析后的路径，未找到返回 null
   */
  private resolveGitBashPath(configuredPath: string): string | null {
    // 如果配置了路径且文件存在，直接使用
    if (configuredPath && this.fileExists(configuredPath)) {
      return configuredPath;
    }

    // 执行自动检测
    return this.detectGitBashPath();
  }

  /**
   * 从 Windows 注册表查询 Git Bash 安装路径
   *
   * 查询 HKEY_LOCAL_MACHINE\SOFTWARE\GitForWindows 的 InstallPath 值，
   * 拼接 \bin\bash.exe 后验证文件是否存在。
   *
   * @returns Git Bash 路径，查询失败或文件不存在返回 null
   */
  private queryGitBashFromRegistry(): string | null {
    try {
      const command = `reg query "${GIT_BASH_REGISTRY_KEY}" /v ${GIT_BASH_REGISTRY_VALUE}`;
      const output = this.execCommand(command);
      const installPath = parseRegistryOutput(output, GIT_BASH_REGISTRY_VALUE);

      if (installPath) {
        const bashPath = path.join(installPath, 'bin', 'bash.exe');
        if (this.fileExists(bashPath)) {
          return bashPath;
        }
      }
    } catch {
      // 注册表查询失败（如 Git 未安装），静默处理
    }

    return null;
  }
}

/**
 * 解析 reg query 命令的输出，提取指定值
 *
 * reg query 输出格式示例：
 * HKEY_LOCAL_MACHINE\SOFTWARE\GitForWindows
 *     InstallPath    REG_SZ    C:\Program Files\Git
 *
 * @param output reg query 命令的标准输出
 * @param valueName 要提取的注册表值名称
 * @returns 提取的值，解析失败返回 null
 */
export function parseRegistryOutput(output: string, valueName: string): string | null {
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配格式：ValueName    REG_SZ    Value
    if (trimmed.startsWith(valueName)) {
      const parts = trimmed.split(/\s{2,}/);
      // parts: [valueName, REG_SZ, value]
      if (parts.length >= 3) {
        return parts[parts.length - 1].trim();
      }
    }
  }
  return null;
}

/**
 * 默认文件存在性检查实现
 */
function defaultFileExists(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * 默认命令执行实现
 */
function defaultExecCommand(command: string): string {
  return execSync(command, { encoding: 'utf-8', timeout: 5000 });
}

/**
 * 默认 PATH 环境变量搜索实现
 *
 * 在 PATH 环境变量的各目录中搜索指定的可执行文件。
 *
 * @param executable 可执行文件名（如 bash.exe）
 * @param envPath 可选的 PATH 环境变量值（用于测试注入）
 * @returns 找到的完整路径，未找到返回 null
 */
function defaultSearchInPath(executable: string, envPath?: string): string | null {
  const pathEnv = envPath ?? process.env.PATH ?? '';
  const dirs = pathEnv.split(path.delimiter);

  for (const dir of dirs) {
    if (!dir) continue;
    const fullPath = path.join(dir, executable);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        return fullPath;
      }
    } catch {
      // 目录不存在或无权限，继续搜索下一个
    }
  }

  return null;
}
