/**
 * Property 13: 默认终端类型配置生效
 *
 * 对于任意有效的 TerminalType 配置值（cmd、powershell、gitbash、windowsTerminal），
 * 当设置为默认终端类型后，新创建的终端应使用该类型启动。
 *
 * **Validates: Requirements 4.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { TerminalTypeResolver } from '../../src/main/terminal-type-resolver';
import { TerminalType, PtyCreateOptions } from '../../src/shared/types';

// --- Mock 工具 ---

/**
 * 创建 mock pty 进程
 */
function createMockPtyProcess(): IPtyProcess {
  return {
    pid: Math.floor(Math.random() * 10000) + 1000,
    onData: () => {},
    onExit: () => {},
    write: () => {},
    resize: () => {},
    kill: () => {},
  };
}

/**
 * 创建 mock pty 工厂（每次 spawn 返回新的 mock 进程）
 */
function createMockFactory(): IPtyFactory {
  return {
    spawn: () => createMockPtyProcess(),
  };
}

// --- fast-check 生成器 ---

// 生成有效的 TerminalType
const validTerminalTypeArb: fc.Arbitrary<TerminalType> = fc.constantFrom(
  'cmd', 'powershell', 'gitbash', 'windowsTerminal'
);

// 生成无效的终端类型字符串（用于测试 getDefaultTerminalType 的回退逻辑）
const invalidTerminalTypeArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => !['cmd', 'powershell', 'gitbash', 'windowsTerminal'].includes(s));

// 生成有效的工作目录路径
const cwdArb: fc.Arbitrary<string> = fc.constantFrom(
  'D:\\Projects\\test',
  'C:\\Users\\user\\Documents',
  'E:\\workspace',
  'C:\\temp'
);

// 生成有效的 shell 路径
const shellArb: fc.Arbitrary<string> = fc.constantFrom(
  'cmd.exe',
  'powershell.exe',
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'wt.exe'
);

describe('Property 13: 默认终端类型配置生效', () => {
  it('创建终端时指定的 terminalType 应正确记录在实例中', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTerminalTypeArb,
        cwdArb,
        shellArb,
        async (terminalType: TerminalType, cwd: string, shell: string) => {
          // 创建 PtyManager 实例（使用 mock 工厂）
          const manager = new PtyManager(createMockFactory());

          const options: PtyCreateOptions = { cwd, shell };

          // 使用指定的终端类型创建终端
          const terminalId = await manager.create(options, terminalType);

          // 验证：getInstance 返回的实例中 terminalType 与传入值一致
          const instance = manager.getInstance(terminalId);
          expect(instance).toBeDefined();
          expect(instance!.terminalType).toBe(terminalType);

          // 清理
          await manager.destroyAll();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getDefaultTerminalType 对有效终端类型应返回该类型本身', () => {
    fc.assert(
      fc.property(validTerminalTypeArb, (terminalType: TerminalType) => {
        const resolver = new TerminalTypeResolver({
          fileExists: () => false,
          execCommand: () => '',
          searchInPath: () => null,
        });

        // 验证：传入有效终端类型时，返回值与传入值一致
        const result = resolver.getDefaultTerminalType(terminalType);
        expect(result).toBe(terminalType);
      }),
      { numRuns: 100 }
    );
  });

  it('getDefaultTerminalType 对无效值或 undefined 应回退为 cmd', () => {
    fc.assert(
      fc.property(invalidTerminalTypeArb, (invalidType: string) => {
        const resolver = new TerminalTypeResolver({
          fileExists: () => false,
          execCommand: () => '',
          searchInPath: () => null,
        });

        // 验证：传入无效终端类型时，回退为 'cmd'
        const result = resolver.getDefaultTerminalType(invalidType as TerminalType);
        expect(result).toBe('cmd');
      }),
      { numRuns: 100 }
    );

    // 额外验证 undefined 情况
    const resolver = new TerminalTypeResolver({
      fileExists: () => false,
      execCommand: () => '',
      searchInPath: () => null,
    });
    expect(resolver.getDefaultTerminalType(undefined)).toBe('cmd');
  });

  it('使用 getDefaultTerminalType 解析后的类型创建终端，实例类型应一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTerminalTypeArb,
        cwdArb,
        async (configuredType: TerminalType, cwd: string) => {
          const resolver = new TerminalTypeResolver({
            fileExists: () => false,
            execCommand: () => '',
            searchInPath: () => null,
          });

          // 模拟：从配置中获取默认终端类型
          const effectiveType = resolver.getDefaultTerminalType(configuredType);

          // 使用解析后的类型创建终端
          const manager = new PtyManager(createMockFactory());
          const options: PtyCreateOptions = { cwd, shell: 'cmd.exe' };
          const terminalId = await manager.create(options, effectiveType);

          // 验证：终端实例的类型与配置的默认类型一致
          const instance = manager.getInstance(terminalId);
          expect(instance).toBeDefined();
          expect(instance!.terminalType).toBe(configuredType);

          // 清理
          await manager.destroyAll();
        }
      ),
      { numRuns: 100 }
    );
  });
});
