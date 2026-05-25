/**
 * Property 14: 终端类型可用性标识
 *
 * 对于任意终端类型可用性状态组合（每种类型可用或不可用），
 * 终端类型选择菜单应正确标识每种类型的可用状态——可用类型可选择，不可用类型灰显。
 *
 * **Validates: Requirements 4.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TerminalTypeResolver, TerminalAvailability } from '../../src/main/terminal-type-resolver';
import { TerminalType, TerminalPaths } from '../../src/shared/types';

// --- 终端类型列表 ---
const ALL_TERMINAL_TYPES: TerminalType[] = ['cmd', 'powershell', 'gitbash', 'windowsTerminal'];

// --- fast-check 生成器 ---

/**
 * 生成每种终端类型的可用性布尔标志
 * { cmd: true/false, powershell: true/false, gitbash: true/false, windowsTerminal: true/false }
 */
const availabilityFlagsArb: fc.Arbitrary<Record<TerminalType, boolean>> = fc.record({
  cmd: fc.boolean(),
  powershell: fc.boolean(),
  gitbash: fc.boolean(),
  windowsTerminal: fc.boolean(),
});

/**
 * 根据可用性标志创建 TerminalTypeResolver 实例
 *
 * 对于 cmd/powershell/windowsTerminal：它们使用非绝对路径（如 cmd.exe），
 * 会通过 searchInPath 查找。mock searchInPath 根据标志返回路径或 null。
 *
 * 对于 gitbash：使用绝对路径配置，mock fileExists 根据标志返回 true/false。
 */
function createResolverWithFlags(flags: Record<TerminalType, boolean>): TerminalTypeResolver {
  // 定义各终端类型对应的路径映射
  const pathMap: Record<string, string> = {
    'cmd.exe': 'C:\\Windows\\System32\\cmd.exe',
    'powershell.exe': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'wt.exe': 'C:\\Users\\user\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
  };

  // gitbash 配置的绝对路径
  const gitBashPath = 'C:\\Program Files\\Git\\bin\\bash.exe';

  return new TerminalTypeResolver({
    // fileExists: 用于绝对路径检查（gitbash 和 searchInPath 返回的路径）
    fileExists: (filePath: string) => {
      if (filePath === gitBashPath) {
        return flags.gitbash;
      }
      // 对于 searchInPath 返回的路径，根据对应类型的标志返回
      if (filePath === pathMap['cmd.exe']) return flags.cmd;
      if (filePath === pathMap['powershell.exe']) return flags.powershell;
      if (filePath === pathMap['wt.exe']) return flags.windowsTerminal;
      return false;
    },
    // execCommand: 注册表查询（gitbash 自动检测用），这里不需要
    execCommand: () => { throw new Error('not found'); },
    // searchInPath: 用于非绝对路径的可执行文件搜索
    searchInPath: (executable: string) => {
      if (executable === 'cmd.exe' && flags.cmd) {
        return pathMap['cmd.exe'];
      }
      if (executable === 'powershell.exe' && flags.powershell) {
        return pathMap['powershell.exe'];
      }
      if (executable === 'wt.exe' && flags.windowsTerminal) {
        return pathMap['wt.exe'];
      }
      // gitbash 的 bash.exe 搜索（自动检测路径时使用）
      if (executable === 'bash.exe' && flags.gitbash) {
        return gitBashPath;
      }
      return null;
    },
  });
}

/**
 * 创建测试用的 TerminalPaths 配置
 * gitbash 使用绝对路径，其他使用默认的可执行文件名
 */
function createConfiguredPaths(): TerminalPaths {
  return {
    cmd: 'cmd.exe',
    powershell: 'powershell.exe',
    gitbash: 'C:\\Program Files\\Git\\bin\\bash.exe',
    windowsTerminal: 'wt.exe',
  };
}

describe('Property 14: 终端类型可用性标识', () => {
  it('checkAllAvailability 应正确标识每种终端类型的可用状态', () => {
    fc.assert(
      fc.property(availabilityFlagsArb, (flags: Record<TerminalType, boolean>) => {
        // 创建带有 mock 依赖的 resolver
        const resolver = createResolverWithFlags(flags);
        const configuredPaths = createConfiguredPaths();

        // 执行可用性检查
        const result: Record<TerminalType, TerminalAvailability> =
          resolver.checkAllAvailability(configuredPaths);

        // 验证：每种终端类型的 available 状态应与预期标志一致
        for (const type of ALL_TERMINAL_TYPES) {
          expect(result[type]).toBeDefined();
          expect(result[type].available).toBe(flags[type]);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('可用的终端类型应返回有效的 resolvedPath', () => {
    fc.assert(
      fc.property(availabilityFlagsArb, (flags: Record<TerminalType, boolean>) => {
        const resolver = createResolverWithFlags(flags);
        const configuredPaths = createConfiguredPaths();

        const result = resolver.checkAllAvailability(configuredPaths);

        // 验证：可用的终端类型应有非空的 resolvedPath
        for (const type of ALL_TERMINAL_TYPES) {
          if (flags[type]) {
            expect(result[type].resolvedPath).toBeTruthy();
            expect(result[type].resolvedPath.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('不可用的终端类型应包含 reason 说明', () => {
    fc.assert(
      fc.property(availabilityFlagsArb, (flags: Record<TerminalType, boolean>) => {
        const resolver = createResolverWithFlags(flags);
        const configuredPaths = createConfiguredPaths();

        const result = resolver.checkAllAvailability(configuredPaths);

        // 验证：不可用的终端类型应有 reason 字段说明原因
        for (const type of ALL_TERMINAL_TYPES) {
          if (!flags[type]) {
            expect(result[type].reason).toBeDefined();
            expect(result[type].reason!.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('所有 4 种终端类型都应在结果中出现', () => {
    fc.assert(
      fc.property(availabilityFlagsArb, (flags: Record<TerminalType, boolean>) => {
        const resolver = createResolverWithFlags(flags);
        const configuredPaths = createConfiguredPaths();

        const result = resolver.checkAllAvailability(configuredPaths);

        // 验证：结果应包含所有 4 种终端类型
        expect(Object.keys(result)).toHaveLength(4);
        for (const type of ALL_TERMINAL_TYPES) {
          expect(type in result).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
