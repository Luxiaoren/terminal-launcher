import { describe, it, expect } from 'vitest';

/**
 * 项目初始化验证测试
 * 确保测试框架和基础配置正常工作
 */
describe('项目初始化', () => {
  it('Vitest 测试框架正常运行', () => {
    expect(1 + 1).toBe(2);
  });

  it('TypeScript 类型系统正常工作', () => {
    const value: string = 'Terminal Launcher';
    expect(value).toBe('Terminal Launcher');
  });
});
