/**
 * Property 16: 配置持久化往返
 *
 * 对于任意有效的应用配置（包括默认终端类型、终端路径、窗口状态），
 * 执行保存后重新加载应得到与保存前相同的配置值。
 *
 * **Validates: Requirements 4.7, 6.4**
 */
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../src/main/config-manager';
import { AppConfig, TerminalType, TerminalPaths, WindowState, LayoutConfig, RecentFolder } from '../../src/shared/types';

// 创建临时目录用于测试
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-roundtrip-'));
}

// 清理临时目录
function removeTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- fast-check 生成器 ---

// 生成有效的 TerminalType
const terminalTypeArb: fc.Arbitrary<TerminalType> = fc.constantFrom(
  'cmd', 'powershell', 'gitbash', 'windowsTerminal'
);

// 生成有效的终端路径配置
const terminalPathsArb: fc.Arbitrary<TerminalPaths> = fc.record({
  cmd: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
  powershell: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
  gitbash: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
  windowsTerminal: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
});

// 生成有效的窗口状态
const windowStateArb: fc.Arbitrary<WindowState> = fc.record({
  x: fc.integer({ min: -2000, max: 5000 }),
  y: fc.integer({ min: -2000, max: 5000 }),
  width: fc.integer({ min: 200, max: 5000 }),
  height: fc.integer({ min: 200, max: 5000 }),
  isMaximized: fc.boolean(),
});

// 生成有效的布局配置
const layoutConfigArb: fc.Arbitrary<LayoutConfig> = fc.record({
  splitRatio: fc.integer({ min: 15, max: 85 }),
  terminalVisible: fc.boolean(),
});

// 生成有效的最近文件夹记录
const recentFolderArb: fc.Arbitrary<RecentFolder> = fc.record({
  path: fc.string({ minLength: 1, maxLength: 200 }).filter(s => !s.includes('\0')),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
  lastOpened: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
});

// 生成有效的完整应用配置
const appConfigArb: fc.Arbitrary<AppConfig> = fc.record({
  defaultTerminalType: terminalTypeArb,
  terminalPaths: terminalPathsArb,
  recentFolders: fc.array(recentFolderArb, { minLength: 0, maxLength: 10 }),
  windowState: windowStateArb,
  layoutConfig: layoutConfigArb,
});

describe('Property 16: 配置持久化往返', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    // 清理所有临时目录
    for (const dir of tempDirs) {
      removeTempDir(dir);
    }
    tempDirs.length = 0;
  });

  it('保存任意有效配置后重新加载应得到相同值', async () => {
    await fc.assert(
      fc.asyncProperty(appConfigArb, async (config: AppConfig) => {
        // 创建临时目录
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        // 创建第一个 ConfigManager 实例并保存配置
        const manager1 = new ConfigManager(tempDir);
        await manager1.updateConfig(config);

        // 创建第二个 ConfigManager 实例，从同一目录加载配置
        const manager2 = new ConfigManager(tempDir);
        const loadedConfig = manager2.getConfig();

        // 验证加载的配置与保存的配置相同
        // 比较 defaultTerminalType
        if (loadedConfig.defaultTerminalType !== config.defaultTerminalType) {
          return false;
        }

        // 比较 terminalPaths
        if (loadedConfig.terminalPaths.cmd !== config.terminalPaths.cmd) return false;
        if (loadedConfig.terminalPaths.powershell !== config.terminalPaths.powershell) return false;
        if (loadedConfig.terminalPaths.gitbash !== config.terminalPaths.gitbash) return false;
        if (loadedConfig.terminalPaths.windowsTerminal !== config.terminalPaths.windowsTerminal) return false;

        // 比较 windowState
        if (loadedConfig.windowState.x !== config.windowState.x) return false;
        if (loadedConfig.windowState.y !== config.windowState.y) return false;
        if (loadedConfig.windowState.width !== config.windowState.width) return false;
        if (loadedConfig.windowState.height !== config.windowState.height) return false;
        if (loadedConfig.windowState.isMaximized !== config.windowState.isMaximized) return false;

        // 比较 layoutConfig
        if (loadedConfig.layoutConfig.splitRatio !== config.layoutConfig.splitRatio) return false;
        if (loadedConfig.layoutConfig.terminalVisible !== config.layoutConfig.terminalVisible) return false;

        // 比较 recentFolders
        if (loadedConfig.recentFolders.length !== config.recentFolders.length) return false;
        for (let i = 0; i < config.recentFolders.length; i++) {
          if (loadedConfig.recentFolders[i].path !== config.recentFolders[i].path) return false;
          if (loadedConfig.recentFolders[i].name !== config.recentFolders[i].name) return false;
          if (loadedConfig.recentFolders[i].lastOpened !== config.recentFolders[i].lastOpened) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
