import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileSystemService } from '../../src/main/file-system-service';
import { AccessCheckResult } from '../../src/shared/types';

/**
 * 属性测试：不可访问路径禁用状态
 *
 * **Validates: Requirements 1.7, 2.6**
 *
 * 对于任意不可访问的文件夹路径（不存在或权限不足），
 * 无论出现在最近列表还是目录树中，UI 应将其标记为禁用/不可操作状态。
 *
 * 核心逻辑验证：
 * - checkAccess 返回 exists=false 时，路径应标记为 accessible=false
 * - checkAccess 返回 readable=false 时，路径应标记为 accessible=false
 * - 仅当 exists=true 且 readable=true 时，路径才标记为 accessible=true
 */
describe('Property 3: 不可访问路径禁用状态', () => {
  /**
   * 计算路径的可访问状态（与 welcome.ts 中 loadRecentFolders 逻辑一致）
   * accessible = accessResult.exists && accessResult.readable
   */
  function computeAccessible(accessResult: AccessCheckResult): boolean {
    return accessResult.exists && accessResult.readable;
  }

  /**
   * 属性 3.1：对于任意 AccessCheckResult 组合，
   * 当 exists=false 或 readable=false 时，accessible 必须为 false
   */
  it('不存在或不可读的路径必须标记为不可访问（禁用状态）', () => {
    // 生成任意 AccessCheckResult 组合
    const accessCheckResultArb: fc.Arbitrary<AccessCheckResult> = fc.record({
      exists: fc.boolean(),
      readable: fc.boolean(),
      writable: fc.boolean(),
    });

    fc.assert(
      fc.property(accessCheckResultArb, (accessResult: AccessCheckResult) => {
        const accessible = computeAccessible(accessResult);

        // 核心属性：不存在或不可读 => 必须禁用
        if (!accessResult.exists || !accessResult.readable) {
          return accessible === false;
        }

        // 存在且可读 => 必须可访问
        return accessible === true;
      }),
      { numRuns: 200 }
    );
  });

  /**
   * 属性 3.2：使用真实文件系统验证 checkAccess 对不存在路径返回 exists=false，
   * 从而确认该路径会被标记为禁用状态
   */
  it('不存在的路径经 checkAccess 检查后应标记为禁用', async () => {
    const fileSystemService = new FileSystemService();

    // 生成随机路径名（确保不存在）
    const randomPathNameArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 5, maxLength: 20 }
    );

    await fc.assert(
      fc.asyncProperty(randomPathNameArb, async (randomName: string) => {
        // 构造一个确定不存在的路径
        const nonExistentPath = path.join(os.tmpdir(), `__nonexistent_test_${randomName}_${Date.now()}`);

        // 确保路径确实不存在
        if (fs.existsSync(nonExistentPath)) {
          return true; // 跳过极端巧合情况
        }

        const accessResult = await fileSystemService.checkAccess(nonExistentPath);

        // 验证 checkAccess 正确返回 exists=false
        expect(accessResult.exists).toBe(false);

        // 验证禁用逻辑：不存在的路径 accessible 应为 false
        const accessible = computeAccessible(accessResult);
        return accessible === false;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 属性 3.3：使用真实文件系统验证存在且可读的路径返回 accessible=true
   */
  it('存在且可读的路径应标记为可访问（非禁用状态）', async () => {
    const fileSystemService = new FileSystemService();

    // 生成随机目录名
    const randomDirNameArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 3, maxLength: 15 }
    );

    // 创建临时基础目录
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessible-test-'));

    try {
      await fc.assert(
        fc.asyncProperty(randomDirNameArb, async (dirName: string) => {
          // 创建一个真实存在的临时目录
          const testDir = path.join(baseDir, dirName);
          if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
          }

          const accessResult = await fileSystemService.checkAccess(testDir);

          // 验证 checkAccess 正确返回 exists=true 和 readable=true
          expect(accessResult.exists).toBe(true);
          expect(accessResult.readable).toBe(true);

          // 验证可访问逻辑
          const accessible = computeAccessible(accessResult);
          return accessible === true;
        }),
        { numRuns: 100 }
      );
    } finally {
      // 清理临时目录
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  /**
   * 属性 3.4：批量路径中，不可访问路径的禁用判定与可访问路径的启用判定互不干扰
   * 模拟 Welcome_Page 加载时对多个路径的批量检查场景
   */
  it('批量路径检查中禁用状态判定互不干扰', async () => {
    const fileSystemService = new FileSystemService();
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-test-'));

    try {
      // 生成一组路径：部分存在，部分不存在
      const pathCountArb = fc.integer({ min: 2, max: 8 });
      const existsFlagArb = fc.boolean();

      await fc.assert(
        fc.asyncProperty(
          pathCountArb,
          fc.array(existsFlagArb, { minLength: 2, maxLength: 8 }),
          async (_, existsFlags: boolean[]) => {
            // 根据 existsFlags 创建或不创建对应目录
            const paths: Array<{ dirPath: string; shouldExist: boolean }> = existsFlags.map(
              (shouldExist, index) => {
                const dirPath = path.join(baseDir, `batch_${index}_${Date.now()}`);
                if (shouldExist) {
                  fs.mkdirSync(dirPath, { recursive: true });
                }
                return { dirPath, shouldExist };
              }
            );

            // 批量检查所有路径
            const results = await Promise.all(
              paths.map(async ({ dirPath, shouldExist }) => {
                const accessResult = await fileSystemService.checkAccess(dirPath);
                const accessible = computeAccessible(accessResult);
                return { dirPath, shouldExist, accessible, accessResult };
              })
            );

            // 验证每个路径的禁用状态独立且正确
            for (const { shouldExist, accessible, accessResult } of results) {
              if (shouldExist) {
                // 存在的路径应该可访问
                expect(accessResult.exists).toBe(true);
                expect(accessible).toBe(true);
              } else {
                // 不存在的路径应该禁用
                expect(accessResult.exists).toBe(false);
                expect(accessible).toBe(false);
              }
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
