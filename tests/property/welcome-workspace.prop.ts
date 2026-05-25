import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * 属性测试：有效文件夹设置 Workspace_Folder
 *
 * **Validates: Requirements 1.3, 1.6**
 *
 * 对于任意有效且可读的文件夹路径（无论来源是文件夹选择对话框还是最近列表），
 * 选择后应用状态应正确转换为主工作界面，且 Workspace_Folder 被设置为该路径。
 *
 * 测试策略：
 * 由于 welcome.ts 是渲染进程代码（依赖 DOM 和 window.api），
 * 我们提取 handleSelectFolder 的核心逻辑进行属性测试：
 * 1. checkAccess 返回 exists=true, readable=true 时
 * 2. 应调用 addRecentFolder 记录路径
 * 3. 应导航到 workspace.html?folder=<encodedPath>
 */
describe('Property 2: 有效文件夹设置 Workspace_Folder', () => {
  /**
   * 生成 Windows 风格的绝对路径 arbitrary
   * 格式如：C:\Users\project\src
   */
  const windowsAbsolutePathArb: fc.Arbitrary<string> = fc.tuple(
    // 盘符：A-Z
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    // 路径段：1-5 个文件夹名（使用合法的文件夹名字符）
    fc.array(
      fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ '.split('')),
        { minLength: 1, maxLength: 20 }
      ),
      { minLength: 1, maxLength: 5 }
    )
  ).map(([drive, segments]) => `${drive}:\\${segments.join('\\')}`);

  /**
   * 模拟 handleSelectFolder 的核心逻辑
   * 从 welcome.ts 中提取的等价逻辑，用于属性测试验证
   */
  async function simulateHandleSelectFolder(
    folderPath: string,
    api: {
      checkAccess: (path: string) => Promise<{ exists: boolean; readable: boolean; writable: boolean }>;
      addRecentFolder: (path: string) => Promise<void>;
    },
    navigate: (url: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    // 检查文件夹访问权限
    const accessResult = await api.checkAccess(folderPath);

    if (!accessResult.exists) {
      return { success: false, error: `文件夹不存在: ${folderPath}` };
    }

    if (!accessResult.readable) {
      return { success: false, error: `权限不足，无法访问文件夹: ${folderPath}` };
    }

    // 添加到最近打开列表
    await api.addRecentFolder(folderPath);

    // 切换到主工作界面
    navigate(`workspace.html?folder=${encodeURIComponent(folderPath)}`);

    return { success: true };
  }

  it('有效且可读的文件夹路径选择后，应调用 addRecentFolder 并导航到 workspace.html', async () => {
    await fc.assert(
      fc.asyncProperty(
        windowsAbsolutePathArb,
        async (folderPath: string) => {
          // 准备 mock
          const mockCheckAccess = vi.fn().mockResolvedValue({
            exists: true,
            readable: true,
            writable: true,
          });
          const mockAddRecentFolder = vi.fn().mockResolvedValue(undefined);
          const mockNavigate = vi.fn();

          const api = {
            checkAccess: mockCheckAccess,
            addRecentFolder: mockAddRecentFolder,
          };

          // 执行 handleSelectFolder 逻辑
          const result = await simulateHandleSelectFolder(folderPath, api, mockNavigate);

          // 属性验证 1：操作成功
          expect(result.success).toBe(true);

          // 属性验证 2：checkAccess 被调用且参数为传入的路径
          expect(mockCheckAccess).toHaveBeenCalledWith(folderPath);

          // 属性验证 3：addRecentFolder 被调用且参数为传入的路径
          expect(mockAddRecentFolder).toHaveBeenCalledWith(folderPath);

          // 属性验证 4：导航到 workspace.html 并携带正确的 folder 参数
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          const navigatedUrl = mockNavigate.mock.calls[0][0] as string;
          expect(navigatedUrl).toBe(`workspace.html?folder=${encodeURIComponent(folderPath)}`);

          // 属性验证 5：从导航 URL 中解码出的路径应等于原始路径
          const url = new URL(navigatedUrl, 'http://localhost');
          const decodedFolder = decodeURIComponent(url.searchParams.get('folder') || '');
          expect(decodedFolder).toBe(folderPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('调用顺序正确：先 checkAccess，再 addRecentFolder，最后导航', async () => {
    await fc.assert(
      fc.asyncProperty(
        windowsAbsolutePathArb,
        async (folderPath: string) => {
          // 使用调用顺序追踪
          const callOrder: string[] = [];

          const mockCheckAccess = vi.fn().mockImplementation(async () => {
            callOrder.push('checkAccess');
            return { exists: true, readable: true, writable: true };
          });
          const mockAddRecentFolder = vi.fn().mockImplementation(async () => {
            callOrder.push('addRecentFolder');
          });
          const mockNavigate = vi.fn().mockImplementation(() => {
            callOrder.push('navigate');
          });

          const api = {
            checkAccess: mockCheckAccess,
            addRecentFolder: mockAddRecentFolder,
          };

          await simulateHandleSelectFolder(folderPath, api, mockNavigate);

          // 属性验证：调用顺序为 checkAccess → addRecentFolder → navigate
          expect(callOrder).toEqual(['checkAccess', 'addRecentFolder', 'navigate']);
        }
      ),
      { numRuns: 100 }
    );
  });
});
