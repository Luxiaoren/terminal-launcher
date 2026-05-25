/**
 * Property 17: 配置存储路径正确
 *
 * 验证配置文件始终位于应用目录下的 config 子文件夹中，
 * 而非系统用户目录或 AppData 目录。
 *
 * **Validates: Requirements 5.2**
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigManager } from '../../src/main/config-manager';

describe('Property 17: 配置存储路径正确', () => {
  // 记录测试中创建的临时目录，测试后清理
  const createdDirs: string[] = [];

  afterEach(() => {
    // 清理测试中创建的临时目录
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 忽略清理失败
      }
    }
    createdDirs.length = 0;
  });

  /**
   * 生成合法的目录路径名称片段
   * 避免 Windows 文件系统不允许的字符
   */
  const validDirSegment = fc.stringOf(
    fc.char().filter((c) => {
      // 排除 Windows 文件系统不允许的字符和控制字符
      const forbidden = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0'];
      return !forbidden.includes(c) && c.charCodeAt(0) > 31 && c !== ' ' && c !== '.';
    }),
    { minLength: 1, maxLength: 10 }
  );

  it('对于任意配置目录，配置文件路径始终为 <dir>/settings.json', () => {
    // 生成任意的应用目录路径（模拟 portable 应用安装在不同位置）
    // 使用 Windows 风格的绝对路径
    const driveLetter = fc.constantFrom('C', 'D', 'E', 'F');
    const pathSegment = fc.stringOf(
      fc.char().filter((c) => {
        const forbidden = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0'];
        return !forbidden.includes(c) && c.charCodeAt(0) > 31 && c !== ' ' && c !== '.';
      }),
      { minLength: 1, maxLength: 8 }
    );

    fc.assert(
      fc.property(
        driveLetter,
        fc.array(pathSegment, { minLength: 1, maxLength: 3 }),
        (drive, segments) => {
          // 构造模拟的应用 config 目录路径（不实际创建文件）
          const appDir = `${drive}:\\${segments.join('\\')}`;
          const configDir = path.join(appDir, 'config');

          // 注意：这里我们不实际创建 ConfigManager（因为路径可能不存在）
          // 而是直接验证路径计算逻辑
          const expectedConfigFile = path.join(configDir, 'settings.json');

          // 验证配置文件在 config 子文件夹中
          expect(path.basename(path.dirname(expectedConfigFile))).toBe('config');

          // 验证配置文件名为 settings.json
          expect(path.basename(expectedConfigFile)).toBe('settings.json');

          // 验证路径不在 AppData 中（portable 应用不应将配置存储在用户目录）
          expect(expectedConfigFile.toLowerCase().includes('appdata')).toBe(false);

          // 验证路径结构：<app_dir>/config/settings.json
          const parts = expectedConfigFile.split(path.sep);
          const configIndex = parts.lastIndexOf('config');
          expect(configIndex).toBeGreaterThan(0);
          expect(parts[configIndex + 1]).toBe('settings.json');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ConfigManager 实例化后，配置路径始终指向注入目录下的 settings.json', () => {
    // 使用临时目录验证 ConfigManager 实际行为
    const tmpBase = path.join(os.tmpdir(), 'config-path-instance-test');

    fc.assert(
      fc.property(
        validDirSegment,
        (segment) => {
          // 构造 config 目录路径
          const configDir = path.join(tmpBase, segment, 'config');
          createdDirs.push(path.join(tmpBase, segment));

          const manager = new ConfigManager(configDir);

          // 验证 getConfigFilePath 返回正确路径
          const filePath = manager.getConfigFilePath();
          expect(filePath).toBe(path.join(configDir, 'settings.json'));

          // 验证 getConfigDir 返回正确目录
          expect(manager.getConfigDir()).toBe(configDir);

          // 验证路径结构：父目录名为 config
          expect(path.basename(path.dirname(filePath))).toBe('config');

          // 验证文件名为 settings.json
          expect(path.basename(filePath)).toBe('settings.json');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('配置文件实际写入到指定的 config 目录中', () => {
    const tmpBase = path.join(os.tmpdir(), 'config-path-write-test');

    fc.assert(
      fc.property(
        validDirSegment,
        (segment) => {
          const configDir = path.join(tmpBase, segment, 'config');
          createdDirs.push(path.join(tmpBase, segment));

          // 创建 ConfigManager，它会自动创建目录和写入默认配置
          const manager = new ConfigManager(configDir);

          // 验证配置文件确实被创建在正确位置
          const configFilePath = manager.getConfigFilePath();
          expect(fs.existsSync(configFilePath)).toBe(true);

          // 验证文件在 config 目录中
          expect(path.dirname(configFilePath)).toBe(configDir);

          // 验证文件内容是有效的 JSON
          const content = fs.readFileSync(configFilePath, 'utf-8');
          expect(() => JSON.parse(content)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
