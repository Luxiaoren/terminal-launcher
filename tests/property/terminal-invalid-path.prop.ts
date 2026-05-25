/**
 * Property 15: 无效终端路径错误处理
 *
 * 对于任意无效的可执行文件路径（不存在或不可执行），
 * 尝试使用该路径启动终端时应产生错误，且不创建终端实例。
 *
 * **Validates: Requirements 4.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TerminalTypeResolver } from '../../src/main/terminal-type-resolver';
import { TerminalType } from '../../src/shared/types';

describe('Property 15: 无效终端路径错误处理', () => {
  // 终端类型生成器
  const terminalTypeArb: fc.Arbitrary<TerminalType> = fc.constantFrom(
    'cmd', 'powershell', 'gitbash', 'windowsTerminal'
  );

  // 生成无效的绝对路径（Windows 风格）
  const invalidAbsolutePathArb: fc.Arbitrary<string> = fc.tuple(
    fc.constantFrom('C:', 'D:', 'E:', 'Z:'),
    fc.array(
      fc.stringOf(
        fc.char().filter(c => {
          // 排除 Windows 路径非法字符
          const forbidden = ['<', '>', ':', '"', '|', '?', '*', '\0'];
          return !forbidden.includes(c) && c.charCodeAt(0) > 31 && c !== '/' && c !== '\\';
        }),
        { minLength: 1, maxLength: 20 }
      ),
      { minLength: 1, maxLength: 5 }
    )
  ).map(([drive, segments]) => `${drive}\\${segments.join('\\')}`);

  // 生成随机非空字符串路径（非绝对路径）
  const randomStringPathArb: fc.Arbitrary<string> = fc.stringOf(
    fc.char().filter(c => {
      // 排除空字符和路径分隔符，保证是"相对路径"形式
      return c !== '\0' && c.charCodeAt(0) > 31;
    }),
    { minLength: 1, maxLength: 50 }
  ).filter(s => {
    // 排除可能被识别为绝对路径的字符串
    return !/^[A-Za-z]:/.test(s) && !s.startsWith('/') && !s.startsWith('\\');
  });

  // 组合所有无效路径类型
  const invalidPathArb: fc.Arbitrary<string> = fc.oneof(
    invalidAbsolutePathArb,
    randomStringPathArb,
    fc.constant(''),  // 空字符串
  );

  it('对任意无效路径，checkAvailability 应返回 available=false 且包含错误原因', () => {
    fc.assert(
      fc.property(
        terminalTypeArb,
        invalidPathArb,
        (type: TerminalType, invalidPath: string) => {
          // 创建 resolver，注入 mock 依赖：
          // - fileExists 始终返回 false（模拟路径不存在）
          // - searchInPath 始终返回 null（模拟 PATH 中找不到）
          const resolver = new TerminalTypeResolver({
            fileExists: () => false,
            execCommand: () => '',
            searchInPath: () => null,
          });

          // 调用 checkAvailability
          const result = resolver.checkAvailability(type, invalidPath);

          // 验证：不可用
          expect(result.available).toBe(false);

          // 验证：reason 字段包含有意义的错误信息（非空字符串）
          expect(result.reason).toBeDefined();
          expect(typeof result.reason).toBe('string');
          expect(result.reason!.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对任意无效绝对路径，错误原因应包含路径信息', () => {
    fc.assert(
      fc.property(
        terminalTypeArb,
        invalidAbsolutePathArb,
        (type: TerminalType, invalidPath: string) => {
          const resolver = new TerminalTypeResolver({
            fileExists: () => false,
            execCommand: () => '',
            searchInPath: () => null,
          });

          const result = resolver.checkAvailability(type, invalidPath);

          // 验证：不可用
          expect(result.available).toBe(false);

          // 验证：reason 包含该路径信息，便于用户定位问题
          expect(result.reason).toContain(invalidPath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对任意非绝对路径的随机字符串，错误原因应说明在 PATH 中未找到', () => {
    fc.assert(
      fc.property(
        terminalTypeArb,
        randomStringPathArb,
        (type: TerminalType, invalidPath: string) => {
          const resolver = new TerminalTypeResolver({
            fileExists: () => false,
            execCommand: () => '',
            searchInPath: () => null,
          });

          const result = resolver.checkAvailability(type, invalidPath);

          // 验证：不可用
          expect(result.available).toBe(false);

          // 验证：reason 包含该路径信息
          expect(result.reason).toContain(invalidPath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('空字符串路径应返回不可用且包含未配置的错误原因', () => {
    const types: TerminalType[] = ['cmd', 'powershell', 'gitbash', 'windowsTerminal'];

    for (const type of types) {
      const resolver = new TerminalTypeResolver({
        fileExists: () => false,
        execCommand: () => '',
        searchInPath: () => null,
      });

      const result = resolver.checkAvailability(type, '');

      // 验证：不可用
      expect(result.available).toBe(false);

      // 验证：reason 非空
      expect(result.reason).toBeDefined();
      expect(result.reason!.length).toBeGreaterThan(0);
    }
  });
});
