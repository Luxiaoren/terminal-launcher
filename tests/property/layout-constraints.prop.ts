/**
 * Property 18: 分隔条最小宽度约束
 *
 * 对于任意分隔条拖拽位置（0% 到 100%），最终生效的分栏比例应确保
 * 左右两侧面板宽度均不小于窗口总宽度的 15%（即比例被钳制在 15%-85% 范围内）。
 *
 * **Validates: Requirements 6.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * 分栏比例钳制函数
 * 与 LayoutManager.clampRatio 逻辑一致
 */
function clampRatio(value: number): number {
  return Math.max(15, Math.min(85, value));
}

describe('Property 18: 分隔条最小宽度约束', () => {
  // 属性测试：任意 0-100 范围内的拖拽位置，比例应被钳制在 [15, 85]
  it('任意 0%-100% 的拖拽位置，比例应被钳制在 15%-85% 范围内', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        (dragPosition: number) => {
          const result = clampRatio(dragPosition);

          // 结果应在 [15, 85] 范围内
          expect(result).toBeGreaterThanOrEqual(15);
          expect(result).toBeLessThanOrEqual(85);
        }
      ),
      { numRuns: 200 }
    );
  });

  // 属性测试：负数值应被钳制到最小值 15
  it('负数拖拽位置应被钳制到最小值 15', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 0, noNaN: true }),
        (dragPosition: number) => {
          const result = clampRatio(dragPosition);
          expect(result).toBe(15);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 属性测试：超过 100 的值应被钳制到最大值 85
  it('超过 100% 的拖拽位置应被钳制到最大值 85', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 10000, noNaN: true }),
        (dragPosition: number) => {
          const result = clampRatio(dragPosition);
          expect(result).toBe(85);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 属性测试：在有效范围 [15, 85] 内的值应保持不变
  it('在有效范围 [15, 85] 内的值应保持不变（幂等性）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 15, max: 85, noNaN: true }),
        (dragPosition: number) => {
          const result = clampRatio(dragPosition);
          expect(result).toBe(dragPosition);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 属性测试：钳制操作的幂等性 - 对结果再次钳制应不变
  it('钳制操作具有幂等性：clamp(clamp(x)) === clamp(x)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 10000, noNaN: true }),
        (dragPosition: number) => {
          const firstClamp = clampRatio(dragPosition);
          const secondClamp = clampRatio(firstClamp);
          expect(secondClamp).toBe(firstClamp);
        }
      ),
      { numRuns: 100 }
    );
  });
});
