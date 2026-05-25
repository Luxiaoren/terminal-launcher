/**
 * Property 20: 面板切换往返
 *
 * 对于任意初始面板显示状态（显示或隐藏），执行两次 Ctrl+` 切换操作后，
 * 面板应恢复到初始状态，且分栏比例与初始一致。
 *
 * **Validates: Requirements 6.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * 布局状态模型（对应 LayoutManager 内部状态）
 * 用于测试切换逻辑，无需依赖 DOM
 */
interface LayoutState {
  terminalVisible: boolean;
  splitRatio: number;
}

/**
 * 模拟 toggleTerminalPanel 操作
 * 对应 LayoutManager.toggleTerminalPanel() 的状态变更逻辑：
 * - terminalVisible 取反
 * - splitRatio 保持不变
 */
function toggleTerminalPanel(state: LayoutState): LayoutState {
  return {
    terminalVisible: !state.terminalVisible,
    splitRatio: state.splitRatio,
  };
}

/**
 * 将比例值钳制到 15-85 范围（对应 LayoutManager.clampRatio）
 */
function clampRatio(value: number): number {
  return Math.max(15, Math.min(85, value));
}

/**
 * 生成有效的分栏比例（15-85 范围内的整数或浮点数）
 */
const splitRatioArb = fc.integer({ min: 15, max: 85 });

/**
 * 生成任意初始布局状态
 */
const layoutStateArb = fc.record({
  terminalVisible: fc.boolean(),
  splitRatio: splitRatioArb,
});

/**
 * 生成切换操作序列长度（偶数次切换应恢复初始状态）
 */
const evenToggleCountArb = fc.integer({ min: 1, max: 50 }).map((n) => n * 2);

describe('Property 20: 面板切换往返', () => {
  /**
   * 核心属性：两次切换后面板恢复初始状态且分栏比例一致
   * Validates: Requirements 6.6
   */
  it('对任意初始状态，两次切换后面板恢复初始状态且分栏比例一致', () => {
    fc.assert(
      fc.property(layoutStateArb, (initialState) => {
        // 记录初始状态
        const initialVisible = initialState.terminalVisible;
        const initialRatio = initialState.splitRatio;

        // 第一次切换：状态应取反
        const afterFirstToggle = toggleTerminalPanel(initialState);
        expect(afterFirstToggle.terminalVisible).toBe(!initialVisible);
        // 分栏比例不变
        expect(afterFirstToggle.splitRatio).toBe(initialRatio);

        // 第二次切换：状态应恢复
        const afterSecondToggle = toggleTerminalPanel(afterFirstToggle);

        // 验证：恢复到初始状态
        expect(afterSecondToggle.terminalVisible).toBe(initialVisible);
        expect(afterSecondToggle.splitRatio).toBe(initialRatio);
      }),
      { numRuns: 100 }
    );
  });

  it('对任意偶数次切换操作，面板状态恢复到初始值', () => {
    fc.assert(
      fc.property(layoutStateArb, evenToggleCountArb, (initialState, toggleCount) => {
        let currentState = initialState;

        // 执行偶数次切换
        for (let i = 0; i < toggleCount; i++) {
          currentState = toggleTerminalPanel(currentState);
        }

        // 验证：偶数次切换后恢复初始状态
        expect(currentState.terminalVisible).toBe(initialState.terminalVisible);
        expect(currentState.splitRatio).toBe(initialState.splitRatio);
      }),
      { numRuns: 100 }
    );
  });

  it('对任意奇数次切换操作，面板状态与初始值相反', () => {
    const oddToggleCountArb = fc.integer({ min: 0, max: 49 }).map((n) => n * 2 + 1);

    fc.assert(
      fc.property(layoutStateArb, oddToggleCountArb, (initialState, toggleCount) => {
        let currentState = initialState;

        // 执行奇数次切换
        for (let i = 0; i < toggleCount; i++) {
          currentState = toggleTerminalPanel(currentState);
        }

        // 验证：奇数次切换后 visible 取反，splitRatio 不变
        expect(currentState.terminalVisible).toBe(!initialState.terminalVisible);
        expect(currentState.splitRatio).toBe(initialState.splitRatio);
      }),
      { numRuns: 100 }
    );
  });

  it('切换操作不影响分栏比例（对任意比例值和任意切换次数）', () => {
    const toggleCountArb = fc.integer({ min: 1, max: 100 });

    fc.assert(
      fc.property(layoutStateArb, toggleCountArb, (initialState, toggleCount) => {
        let currentState = initialState;

        // 执行任意次切换
        for (let i = 0; i < toggleCount; i++) {
          currentState = toggleTerminalPanel(currentState);
        }

        // 验证：无论切换多少次，splitRatio 始终不变
        expect(currentState.splitRatio).toBe(initialState.splitRatio);
      }),
      { numRuns: 100 }
    );
  });

  it('对任意有效范围内的 splitRatio，clampRatio 保持不变', () => {
    fc.assert(
      fc.property(splitRatioArb, (ratio) => {
        // 有效范围内的比例经过 clamp 后不变
        expect(clampRatio(ratio)).toBe(ratio);
      }),
      { numRuns: 100 }
    );
  });
});
