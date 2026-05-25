/**
 * 集成测试：终端创建和命令执行端到端流程
 *
 * 测试内容：
 * - PtyManager + FileSystemService 联合工作流程
 * - 真实终端进程创建与数据交互
 * - IPC 通信正确性（通过模拟 IPC 层验证）
 * - 文件夹选择对话框交互
 *
 * 验证需求: 3.1, 3.4
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { FileSystemService, DialogProvider } from '../../src/main/file-system-service';
import { PtyCreateOptions } from '../../src/shared/types';

/**
 * 判断当前是否为 Windows 环境
 * 真实终端测试仅在 Windows 上运行
 */
const isWindows = os.platform() === 'win32';

/**
 * 创建临时测试目录
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-e2e-'));
}

/**
 * 清理临时测试目录
 */
function cleanupTempDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // 静默处理清理失败
  }
}

describe('集成测试：PtyManager + FileSystemService 联合流程', () => {
  let tempDir: string;
  let fileSystemService: FileSystemService;
  let mockDialogProvider: DialogProvider;

  beforeEach(() => {
    tempDir = createTempDir();
    mockDialogProvider = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: [tempDir],
      }),
    };
    fileSystemService = new FileSystemService(mockDialogProvider);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('应能在真实临时目录中检查访问权限', async () => {
    // 验证 FileSystemService 能正确检查真实目录的权限
    const result = await fileSystemService.checkAccess(tempDir);

    expect(result.exists).toBe(true);
    expect(result.readable).toBe(true);
    expect(result.writable).toBe(true);
  });

  it('应能读取真实目录的子文件夹列表', async () => {
    // 在临时目录中创建子文件夹
    const subDir1 = path.join(tempDir, 'alpha');
    const subDir2 = path.join(tempDir, 'beta');
    fs.mkdirSync(subDir1);
    fs.mkdirSync(subDir2);

    // 创建一个文件（应被过滤掉）
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');

    const folders = await fileSystemService.readSubfolders(tempDir);

    // 应只返回文件夹，不包含文件
    expect(folders).toHaveLength(2);
    expect(folders[0].name).toBe('alpha');
    expect(folders[1].name).toBe('beta');
    expect(folders[0].accessible).toBe(true);
    expect(folders[1].accessible).toBe(true);
  });

  it('应能通过 FileSystemService 获取目录后使用 PtyManager 创建终端（mock pty）', async () => {
    // 模拟完整流程：选择文件夹 → 检查权限 → 创建终端
    const selectedPath = await fileSystemService.openFolderDialog();
    expect(selectedPath).toBe(tempDir);

    const accessResult = await fileSystemService.checkAccess(selectedPath!);
    expect(accessResult.exists).toBe(true);
    expect(accessResult.readable).toBe(true);

    // 使用 mock pty 工厂创建终端（避免真实进程依赖）
    const mockProcess: IPtyProcess = {
      pid: 12345,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    const mockFactory: IPtyFactory = {
      spawn: vi.fn().mockReturnValue(mockProcess),
    };
    const ptyManager = new PtyManager(mockFactory);

    const options: PtyCreateOptions = {
      cwd: selectedPath!,
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);
    expect(terminalId).toBeDefined();

    // 验证 pty 工厂使用了正确的工作目录
    expect(mockFactory.spawn).toHaveBeenCalledWith(
      'cmd.exe',
      [],
      expect.objectContaining({ cwd: tempDir })
    );

    // 清理
    await ptyManager.destroy(terminalId);
  });
});

describe.skipIf(!isWindows)('集成测试：真实终端进程（仅 Windows）', () => {
  let tempDir: string;
  let ptyManager: PtyManager;

  beforeEach(() => {
    tempDir = createTempDir();
    // 使用真实 node-pty（不注入 mock）
    ptyManager = new PtyManager();
  });

  afterEach(async () => {
    // 确保所有终端被清理
    await ptyManager.destroyAll();
    cleanupTempDir(tempDir);
  });

  it('应能创建真实 cmd.exe 终端进程', async () => {
    const options: PtyCreateOptions = {
      cwd: tempDir,
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);
    expect(terminalId).toBeDefined();

    const instance = ptyManager.getInstance(terminalId);
    expect(instance).toBeDefined();
    expect(instance!.status).toBe('running');
    expect(instance!.pid).toBeGreaterThan(0);
    expect(instance!.cwd).toBe(tempDir);
  });

  it('应能向终端写入命令并接收输出', async () => {
    const options: PtyCreateOptions = {
      cwd: tempDir,
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);

    // 收集终端输出
    const outputChunks: string[] = [];
    ptyManager.on('data', (id: string, data: string) => {
      if (id === terminalId) {
        outputChunks.push(data);
      }
    });

    // 向终端写入 echo 命令
    ptyManager.write(terminalId, 'echo INTEGRATION_TEST_OUTPUT\r\n');

    // 等待输出（给终端一些时间处理）
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const fullOutput = outputChunks.join('');
    // 验证输出中包含我们 echo 的内容
    expect(fullOutput).toContain('INTEGRATION_TEST_OUTPUT');
  }, 10000);

  it('应能正确处理终端退出', async () => {
    const options: PtyCreateOptions = {
      cwd: tempDir,
      shell: 'cmd.exe',
      args: ['/C', 'echo done'],
    };

    const terminalId = await ptyManager.create(options);

    // 监听退出事件
    const exitPromise = new Promise<number>((resolve) => {
      ptyManager.on('exit', (id: string, exitCode: number) => {
        if (id === terminalId) {
          resolve(exitCode);
        }
      });
    });

    // cmd /C "echo done" 会执行完后自动退出
    const exitCode = await exitPromise;
    expect(exitCode).toBe(0);

    // 验证终端状态已更新
    const instance = ptyManager.getInstance(terminalId);
    expect(instance!.status).toBe('exited');
    expect(instance!.exitCode).toBe(0);
  }, 10000);

  it('应能调整终端尺寸', async () => {
    const options: PtyCreateOptions = {
      cwd: tempDir,
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);

    // resize 不应抛出错误
    expect(() => {
      ptyManager.resize(terminalId, 120, 40);
    }).not.toThrow();
  });
});

describe('集成测试：IPC 通信正确性验证', () => {
  it('PtyManager 事件回调应正确传递 terminalId 和数据', async () => {
    // 模拟 IPC 层：验证 PtyManager 的事件能正确传递给回调
    let dataCallbackFn: ((data: string) => void) | null = null;
    let exitCallbackFn: ((exitData: { exitCode: number }) => void) | null = null;

    const mockProcess: IPtyProcess = {
      pid: 9999,
      onData: (cb) => { dataCallbackFn = cb; },
      onExit: (cb) => { exitCallbackFn = cb; },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    const mockFactory: IPtyFactory = {
      spawn: vi.fn().mockReturnValue(mockProcess),
    };

    const ptyManager = new PtyManager(mockFactory);

    // 模拟 IPC 推送回调（类似 ipc-handlers.ts 中的注册逻辑）
    const ipcDataMessages: Array<{ channel: string; data: string }> = [];
    const ipcExitMessages: Array<{ channel: string; exitCode: number }> = [];

    const options: PtyCreateOptions = {
      cwd: 'D:\\test',
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);

    // 注册类似 IPC 处理器中的回调
    ptyManager.on('data', (id: string, data: string) => {
      ipcDataMessages.push({ channel: `pty:data:${id}`, data });
    });
    ptyManager.on('exit', (id: string, exitCode: number) => {
      ipcExitMessages.push({ channel: `pty:exit:${id}`, exitCode });
    });

    // 模拟终端输出数据
    dataCallbackFn!('Hello from terminal');

    expect(ipcDataMessages).toHaveLength(1);
    expect(ipcDataMessages[0].channel).toBe(`pty:data:${terminalId}`);
    expect(ipcDataMessages[0].data).toBe('Hello from terminal');

    // 模拟终端退出
    exitCallbackFn!({ exitCode: 0 });

    expect(ipcExitMessages).toHaveLength(1);
    expect(ipcExitMessages[0].channel).toBe(`pty:exit:${terminalId}`);
    expect(ipcExitMessages[0].exitCode).toBe(0);
  });

  it('PtyManager write 应正确转发数据到 pty 进程', async () => {
    const mockProcess: IPtyProcess = {
      pid: 8888,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    const mockFactory: IPtyFactory = {
      spawn: vi.fn().mockReturnValue(mockProcess),
    };

    const ptyManager = new PtyManager(mockFactory);

    const options: PtyCreateOptions = {
      cwd: 'D:\\test',
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);

    // 模拟 IPC 写入请求
    const inputData = 'ls -la\r\n';
    ptyManager.write(terminalId, inputData);

    expect(mockProcess.write).toHaveBeenCalledWith(inputData);
  });

  it('PtyManager resize 应正确转发尺寸到 pty 进程', async () => {
    const mockProcess: IPtyProcess = {
      pid: 7777,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    const mockFactory: IPtyFactory = {
      spawn: vi.fn().mockReturnValue(mockProcess),
    };

    const ptyManager = new PtyManager(mockFactory);

    const options: PtyCreateOptions = {
      cwd: 'D:\\test',
      shell: 'cmd.exe',
      args: [],
    };

    const terminalId = await ptyManager.create(options);

    // 模拟 IPC resize 请求
    ptyManager.resize(terminalId, 100, 50);

    expect(mockProcess.resize).toHaveBeenCalledWith(100, 50);
  });
});

describe('集成测试：文件夹选择对话框交互', () => {
  it('openFolderDialog 应在用户选择文件夹时返回路径', async () => {
    const expectedPath = 'D:\\Projects\\my-app';
    const mockDialogProvider: DialogProvider = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: [expectedPath],
      }),
    };

    const fileSystemService = new FileSystemService(mockDialogProvider);
    const result = await fileSystemService.openFolderDialog();

    expect(result).toBe(expectedPath);
    expect(mockDialogProvider.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory'],
      title: '选择文件夹',
    });
  });

  it('openFolderDialog 应在用户取消时返回 null', async () => {
    const mockDialogProvider: DialogProvider = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePaths: [],
      }),
    };

    const fileSystemService = new FileSystemService(mockDialogProvider);
    const result = await fileSystemService.openFolderDialog();

    expect(result).toBeNull();
  });

  it('完整流程：对话框选择 → 权限检查 → 终端创建', async () => {
    const tempDir = createTempDir();

    try {
      // 步骤 1：模拟对话框选择文件夹
      const mockDialogProvider: DialogProvider = {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: [tempDir],
        }),
      };
      const fileSystemService = new FileSystemService(mockDialogProvider);

      const selectedPath = await fileSystemService.openFolderDialog();
      expect(selectedPath).toBe(tempDir);

      // 步骤 2：检查路径权限
      const access = await fileSystemService.checkAccess(selectedPath!);
      expect(access.exists).toBe(true);
      expect(access.readable).toBe(true);

      // 步骤 3：使用选择的路径创建终端
      const mockProcess: IPtyProcess = {
        pid: 5555,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      const mockFactory: IPtyFactory = {
        spawn: vi.fn().mockReturnValue(mockProcess),
      };
      const ptyManager = new PtyManager(mockFactory);

      const terminalId = await ptyManager.create({
        cwd: selectedPath!,
        shell: 'cmd.exe',
        args: [],
      });

      expect(terminalId).toBeDefined();
      const instance = ptyManager.getInstance(terminalId);
      expect(instance!.cwd).toBe(tempDir);
      expect(instance!.status).toBe('running');

      // 清理
      await ptyManager.destroy(terminalId);
    } finally {
      cleanupTempDir(tempDir);
    }
  });
});
