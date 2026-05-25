/**
 * TerminalTypeResolver 单元测试
 *
 * 测试终端类型检测与路径管理模块的核心功能：
 * - 各终端类型的可执行文件路径解析
 * - Git Bash 路径自动检测策略
 * - 终端类型可用性检查
 * - 默认终端类型配置读取
 * - 注册表输出解析
 */

import { describe, it, expect } from 'vitest';
import {
  TerminalTypeResolver,
  parseRegistryOutput,
  TerminalTypeResolverDeps,
} from '../../src/main/terminal-type-resolver';
import { TerminalPaths, TerminalType } from '../../src/shared/types';

// 默认测试用终端路径配置
const defaultPaths: TerminalPaths = {
  cmd: 'cmd.exe',
  powershell: 'powershell.exe',
  gitbash: 'C:\\Program Files\\Git\\bin\\bash.exe',
  windowsTerminal: 'wt.exe',
};

/**
 * 创建带有自定义依赖的 TerminalTypeResolver 实例
 */
function createResolver(deps?: Partial<TerminalTypeResolverDeps>): TerminalTypeResolver {
  return new TerminalTypeResolver({
    fileExists: deps?.fileExists ?? (() => false),
    execCommand: deps?.execCommand ?? (() => ''),
    searchInPath: deps?.searchInPath ?? (() => null),
    envPath: deps?.envPath,
  });
}

describe('TerminalTypeResolver', () => {
  describe('resolveShellPath', () => {
    it('cmd 类型应返回配置的路径', () => {
      const resolver = createResolver();
      const result = resolver.resolveShellPath('cmd', defaultPaths);
      expect(result).toBe('cmd.exe');
    });

    it('powershell 类型应返回配置的路径', () => {
      const resolver = createResolver();
      const result = resolver.resolveShellPath('powershell', defaultPaths);
      expect(result).toBe('powershell.exe');
    });

    it('windowsTerminal 类型应返回配置的路径', () => {
      const resolver = createResolver();
      const result = resolver.resolveShellPath('windowsTerminal', defaultPaths);
      expect(result).toBe('wt.exe');
    });

    it('gitbash 配置路径存在时应直接使用配置路径', () => {
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\Program Files\\Git\\bin\\bash.exe',
      });
      const result = resolver.resolveShellPath('gitbash', defaultPaths);
      expect(result).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    });

    it('gitbash 配置路径不存在时应执行自动检测', () => {
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      });
      const paths: TerminalPaths = {
        ...defaultPaths,
        gitbash: 'D:\\nonexistent\\bash.exe', // 配置路径不存在
      };
      const result = resolver.resolveShellPath('gitbash', paths);
      // 应通过自动检测找到 x86 路径
      expect(result).toBe('C:\\Program Files (x86)\\Git\\bin\\bash.exe');
    });

    it('cmd/powershell/windowsTerminal 配置为空时应使用默认值', () => {
      const resolver = createResolver();
      const emptyPaths: TerminalPaths = {
        cmd: '',
        powershell: '',
        gitbash: '',
        windowsTerminal: '',
      };
      expect(resolver.resolveShellPath('cmd', emptyPaths)).toBe('cmd.exe');
      expect(resolver.resolveShellPath('powershell', emptyPaths)).toBe('powershell.exe');
      expect(resolver.resolveShellPath('windowsTerminal', emptyPaths)).toBe('wt.exe');
    });
  });

  describe('detectGitBashPath', () => {
    it('优先级 1：应首先检测 C:\\Program Files\\Git\\bin\\bash.exe', () => {
      const resolver = createResolver({
        fileExists: (p) =>
          p === 'C:\\Program Files\\Git\\bin\\bash.exe' ||
          p === 'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    });

    it('优先级 2：第一路径不存在时检测 x86 路径', () => {
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBe('C:\\Program Files (x86)\\Git\\bin\\bash.exe');
    });

    it('优先级 3：已知路径不存在时在 PATH 中搜索 bash.exe', () => {
      const resolver = createResolver({
        fileExists: () => false,
        searchInPath: (exe) => {
          if (exe === 'bash.exe') return 'D:\\CustomGit\\bin\\bash.exe';
          return null;
        },
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBe('D:\\CustomGit\\bin\\bash.exe');
    });

    it('优先级 4：PATH 中未找到时查询注册表', () => {
      const registryOutput = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows
    InstallPath    REG_SZ    C:\\CustomGit
`;
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\CustomGit\\bin\\bash.exe',
        searchInPath: () => null,
        execCommand: () => registryOutput,
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBe('C:\\CustomGit\\bin\\bash.exe');
    });

    it('所有检测方式都失败时应返回 null', () => {
      const resolver = createResolver({
        fileExists: () => false,
        searchInPath: () => null,
        execCommand: () => { throw new Error('reg query failed'); },
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBeNull();
    });

    it('注册表查询成功但路径文件不存在时应返回 null', () => {
      const registryOutput = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows
    InstallPath    REG_SZ    C:\\DeletedGit
`;
      const resolver = createResolver({
        fileExists: () => false,
        searchInPath: () => null,
        execCommand: () => registryOutput,
      });
      const result = resolver.detectGitBashPath();
      expect(result).toBeNull();
    });
  });

  describe('checkAvailability', () => {
    it('绝对路径存在时应返回 available: true', () => {
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\Windows\\System32\\cmd.exe',
      });
      const result = resolver.checkAvailability('cmd', 'C:\\Windows\\System32\\cmd.exe');
      expect(result.available).toBe(true);
      expect(result.resolvedPath).toBe('C:\\Windows\\System32\\cmd.exe');
    });

    it('绝对路径不存在时应返回 available: false', () => {
      const resolver = createResolver({ fileExists: () => false });
      const result = resolver.checkAvailability('gitbash', 'C:\\nonexistent\\bash.exe');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('不存在');
    });

    it('非绝对路径在 PATH 中找到时应返回 available: true', () => {
      const resolver = createResolver({
        searchInPath: (exe) => {
          if (exe === 'cmd.exe') return 'C:\\Windows\\System32\\cmd.exe';
          return null;
        },
      });
      const result = resolver.checkAvailability('cmd', 'cmd.exe');
      expect(result.available).toBe(true);
      expect(result.resolvedPath).toBe('C:\\Windows\\System32\\cmd.exe');
    });

    it('非绝对路径在 PATH 中未找到时应返回 available: false', () => {
      const resolver = createResolver({ searchInPath: () => null });
      const result = resolver.checkAvailability('windowsTerminal', 'wt.exe');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('未找到');
    });

    it('空路径应返回 available: false', () => {
      const resolver = createResolver();
      const result = resolver.checkAvailability('cmd', '');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('未配置');
    });
  });

  describe('checkAllAvailability', () => {
    it('应检查所有四种终端类型的可用性', () => {
      const resolver = createResolver({
        fileExists: (p) => p === 'C:\\Program Files\\Git\\bin\\bash.exe',
        searchInPath: (exe) => {
          if (exe === 'cmd.exe') return 'C:\\Windows\\System32\\cmd.exe';
          if (exe === 'powershell.exe') return 'C:\\Windows\\System32\\powershell.exe';
          return null;
        },
      });
      const result = resolver.checkAllAvailability(defaultPaths);

      expect(result.cmd.available).toBe(true);
      expect(result.powershell.available).toBe(true);
      expect(result.gitbash.available).toBe(true);
      expect(result.windowsTerminal.available).toBe(false);
    });
  });

  describe('getDefaultTerminalType', () => {
    it('有效的终端类型应直接返回', () => {
      const resolver = createResolver();
      expect(resolver.getDefaultTerminalType('powershell')).toBe('powershell');
      expect(resolver.getDefaultTerminalType('gitbash')).toBe('gitbash');
      expect(resolver.getDefaultTerminalType('windowsTerminal')).toBe('windowsTerminal');
      expect(resolver.getDefaultTerminalType('cmd')).toBe('cmd');
    });

    it('未设定时应返回 cmd 作为默认值', () => {
      const resolver = createResolver();
      expect(resolver.getDefaultTerminalType(undefined)).toBe('cmd');
    });

    it('无效值时应返回 cmd 作为默认值', () => {
      const resolver = createResolver();
      expect(resolver.getDefaultTerminalType('invalid' as TerminalType)).toBe('cmd');
    });
  });

  describe('parseRegistryOutput', () => {
    it('应正确解析标准 reg query 输出', () => {
      const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows
    InstallPath    REG_SZ    C:\\Program Files\\Git
`;
      const result = parseRegistryOutput(output, 'InstallPath');
      expect(result).toBe('C:\\Program Files\\Git');
    });

    it('应处理带有多个空格分隔的输出', () => {
      const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows
    InstallPath    REG_SZ    D:\\Tools\\Git For Windows
`;
      const result = parseRegistryOutput(output, 'InstallPath');
      expect(result).toBe('D:\\Tools\\Git For Windows');
    });

    it('值不存在时应返回 null', () => {
      const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows
    OtherValue    REG_SZ    something
`;
      const result = parseRegistryOutput(output, 'InstallPath');
      expect(result).toBeNull();
    });

    it('空输出应返回 null', () => {
      const result = parseRegistryOutput('', 'InstallPath');
      expect(result).toBeNull();
    });

    it('格式不正确的行应返回 null', () => {
      const output = 'InstallPath';
      const result = parseRegistryOutput(output, 'InstallPath');
      expect(result).toBeNull();
    });
  });
});
