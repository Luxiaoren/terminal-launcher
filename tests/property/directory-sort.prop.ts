/**
 * 属性测试：目录树排序规则
 * Property 6: 对于任意文件夹名称列表，排序结果满足：
 * 1. 所有英文字母开头的名称排在中文字符开头的名称之前
 * 2. 同组内按不区分大小写字典序排列
 *
 * Validates: Requirements 2.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { compareFolderNames } from '../../src/main/file-system-service';

// 判断字符是否为 ASCII 字母
function isAsciiLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

// 生成英文字母开头的文件夹名称
const englishNameArb = fc.stringOf(
  fc.oneof(
    fc.char16bits().filter((c) => c.length > 0 && c !== '\x00'),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  ),
  { minLength: 1, maxLength: 20 }
).filter((s) => s.length > 0 && isAsciiLetter(s[0]));

// 生成中文字符开头的文件夹名称（Unicode 范围 \u4e00-\u9fff）
const chineseCharArb = fc.integer({ min: 0x4e00, max: 0x9fff }).map((code) => String.fromCharCode(code));

const chineseNameArb = fc.tuple(
  chineseCharArb,
  fc.stringOf(
    fc.oneof(
      chineseCharArb,
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''))
    ),
    { minLength: 0, maxLength: 19 }
  )
).map(([first, rest]) => first + rest);

// 混合名称生成器
const folderNameArb = fc.oneof(englishNameArb, chineseNameArb);

// 文件夹名称列表生成器
const folderNameListArb = fc.array(folderNameArb, { minLength: 0, maxLength: 50 });

describe('Property 6: 目录树排序规则', () => {
  /**
   * Validates: Requirements 2.5
   */
  it('排序后英文字母开头的名称全部排在中文字符开头的名称之前', () => {
    fc.assert(
      fc.property(folderNameListArb, (names) => {
        // 使用 compareFolderNames 排序
        const sorted = [...names].sort(compareFolderNames);

        // 找到第一个非英文字母开头的名称的索引
        const firstNonEnglishIndex = sorted.findIndex(
          (name) => name.length > 0 && !isAsciiLetter(name[0])
        );

        // 如果存在非英文名称，则其后不应出现英文名称
        if (firstNonEnglishIndex !== -1) {
          for (let i = firstNonEnglishIndex; i < sorted.length; i++) {
            expect(
              sorted[i].length === 0 || !isAsciiLetter(sorted[i][0])
            ).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('同组内（英文组）按不区分大小写字典序排列', () => {
    fc.assert(
      fc.property(folderNameListArb, (names) => {
        const sorted = [...names].sort(compareFolderNames);

        // 提取英文组
        const englishGroup = sorted.filter(
          (name) => name.length > 0 && isAsciiLetter(name[0])
        );

        // 验证英文组内相邻元素满足不区分大小写字典序
        for (let i = 0; i < englishGroup.length - 1; i++) {
          const cmp = englishGroup[i].localeCompare(englishGroup[i + 1], undefined, {
            sensitivity: 'base',
          });
          expect(cmp).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('同组内（中文组）按不区分大小写字典序排列', () => {
    fc.assert(
      fc.property(folderNameListArb, (names) => {
        const sorted = [...names].sort(compareFolderNames);

        // 提取中文组
        const chineseGroup = sorted.filter(
          (name) => name.length > 0 && !isAsciiLetter(name[0])
        );

        // 验证中文组内相邻元素满足不区分大小写字典序
        for (let i = 0; i < chineseGroup.length - 1; i++) {
          const cmp = chineseGroup[i].localeCompare(chineseGroup[i + 1], undefined, {
            sensitivity: 'base',
          });
          expect(cmp).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('排序结果长度与输入一致（不丢失元素）', () => {
    fc.assert(
      fc.property(folderNameListArb, (names) => {
        const sorted = [...names].sort(compareFolderNames);
        expect(sorted.length).toBe(names.length);
      }),
      { numRuns: 100 }
    );
  });
});
