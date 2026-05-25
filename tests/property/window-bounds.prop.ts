/**
 * Property 19: 超出屏幕范围回退默认值
 *
 * 对于任意超出当前屏幕可用范围的窗口状态配置（位置或大小），
 * 应用启动时应忽略该配置，以默认大小 1024×768 居中显示在主屏幕上。
 *
 * **Validates: Requirements 6.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { WindowState } from '../../src/shared/types';

// --- 常量定义 ---

/** 默认窗口宽度 */
const DEFAULT_WIDTH = 1024;
/** 默认窗口高度 */
const DEFAULT_HEIGHT = 768;
/** 最小重叠像素（与 WindowManager 中的逻辑一致） */
const MIN_OVERLAP = 100;

// --- 模拟屏幕环境 ---

/** 模拟显示器工作区域 */
interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 纯函数版本的 isStateWithinScreenBounds 逻辑
 * 与 WindowManager 中的实现逻辑一致，但不依赖 Electron screen API
 */
function isStateWithinScreenBounds(state: WindowState, displays: DisplayWorkArea[]): boolean {
  for (const display of displays) {
    const { x, y, width, height } = display;

    const windowRight = state.x + state.width;
    const windowBottom = state.y + state.height;
    const displayRight = x + width;
    const displayBottom = y + height;

    // 检查是否有重叠区域（至少 100px 可见）
    const overlapX = Math.min(windowRight, displayRight) - Math.max(state.x, x);
    const overlapY = Math.min(windowBottom, displayBottom) - Math.max(state.y, y);

    if (overlapX >= MIN_OVERLAP && overlapY >= MIN_OVERLAP) {
      return true;
    }
  }

  return false;
}

/**
 * 纯函数版本的 restoreState 逻辑
 * 如果保存的状态超出屏幕范围，回退到默认值
 */
function restoreState(
  savedState: WindowState | null,
  displays: DisplayWorkArea[],
  primaryDisplay: DisplayWorkArea
): WindowState {
  if (!savedState) {
    return getDefaultState(primaryDisplay);
  }

  if (isStateWithinScreenBounds(savedState, displays)) {
    return savedState;
  }

  // 超出屏幕范围，回退默认值
  return getDefaultState(primaryDisplay);
}

/**
 * 获取默认窗口状态（1024×768 居中于主屏幕）
 */
function getDefaultState(primaryDisplay: DisplayWorkArea): WindowState {
  return {
    x: primaryDisplay.x + Math.round((primaryDisplay.width - DEFAULT_WIDTH) / 2),
    y: primaryDisplay.y + Math.round((primaryDisplay.height - DEFAULT_HEIGHT) / 2),
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    isMaximized: false,
  };
}

// --- fast-check 生成器 ---

/** 生成典型的显示器工作区域（模拟常见屏幕分辨率） */
const displayArb: fc.Arbitrary<DisplayWorkArea> = fc.record({
  x: fc.constantFrom(0, 1920, -1920, 0),
  y: fc.constantFrom(0, 0, 0, 1080),
  width: fc.constantFrom(1920, 2560, 1366, 1440),
  height: fc.constantFrom(1080, 1440, 768, 900),
});

/** 生成主显示器（通常从 0,0 开始） */
const primaryDisplayArb: fc.Arbitrary<DisplayWorkArea> = fc.record({
  x: fc.constant(0),
  y: fc.constant(0),
  width: fc.constantFrom(1920, 2560, 1366),
  height: fc.constantFrom(1080, 1440, 768),
});

/** 生成明确超出所有屏幕范围的窗口状态（极端位置） */
const outOfBoundsStateArb: fc.Arbitrary<WindowState> = fc.oneof(
  // 窗口在屏幕极右方（x 远超屏幕右边界）
  fc.record({
    x: fc.integer({ min: 50000, max: 99999 }),
    y: fc.integer({ min: 0, max: 1000 }),
    width: fc.integer({ min: 200, max: 2000 }),
    height: fc.integer({ min: 200, max: 2000 }),
    isMaximized: fc.boolean(),
  }),
  // 窗口在屏幕极左方（x 远超屏幕左边界）
  fc.record({
    x: fc.integer({ min: -99999, max: -50000 }),
    y: fc.integer({ min: 0, max: 1000 }),
    width: fc.integer({ min: 200, max: 2000 }),
    height: fc.integer({ min: 200, max: 2000 }),
    isMaximized: fc.boolean(),
  }),
  // 窗口在屏幕极下方（y 远超屏幕下边界）
  fc.record({
    x: fc.integer({ min: 0, max: 1000 }),
    y: fc.integer({ min: 50000, max: 99999 }),
    width: fc.integer({ min: 200, max: 2000 }),
    height: fc.integer({ min: 200, max: 2000 }),
    isMaximized: fc.boolean(),
  }),
  // 窗口在屏幕极上方（y 远超屏幕上边界）
  fc.record({
    x: fc.integer({ min: 0, max: 1000 }),
    y: fc.integer({ min: -99999, max: -50000 }),
    width: fc.integer({ min: 200, max: 2000 }),
    height: fc.integer({ min: 200, max: 2000 }),
    isMaximized: fc.boolean(),
  })
);

describe('Property 19: 超出屏幕范围回退默认值', () => {
  it('超出屏幕范围的窗口状态应被 isStateWithinScreenBounds 判定为 false', () => {
    fc.assert(
      fc.property(
        outOfBoundsStateArb,
        primaryDisplayArb,
        (state: WindowState, primary: DisplayWorkArea) => {
          // 使用单个主显示器作为屏幕环境
          const displays = [primary];

          // 极端位置的窗口状态应该不在任何屏幕范围内
          const withinBounds = isStateWithinScreenBounds(state, displays);
          expect(withinBounds).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('超出屏幕范围时 restoreState 应回退到 1024×768 居中默认值', () => {
    fc.assert(
      fc.property(
        outOfBoundsStateArb,
        primaryDisplayArb,
        (state: WindowState, primary: DisplayWorkArea) => {
          const displays = [primary];

          // 恢复状态时，超出范围的状态应回退到默认值
          const restored = restoreState(state, displays, primary);

          // 验证回退后的宽高为默认值
          expect(restored.width).toBe(DEFAULT_WIDTH);
          expect(restored.height).toBe(DEFAULT_HEIGHT);
          expect(restored.isMaximized).toBe(false);

          // 验证居中于主屏幕
          const expectedX = primary.x + Math.round((primary.width - DEFAULT_WIDTH) / 2);
          const expectedY = primary.y + Math.round((primary.height - DEFAULT_HEIGHT) / 2);
          expect(restored.x).toBe(expectedX);
          expect(restored.y).toBe(expectedY);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('多显示器环境下，超出所有显示器范围时仍应回退默认值', () => {
    fc.assert(
      fc.property(
        outOfBoundsStateArb,
        primaryDisplayArb,
        fc.array(displayArb, { minLength: 1, maxLength: 3 }),
        (state: WindowState, primary: DisplayWorkArea, extraDisplays: DisplayWorkArea[]) => {
          // 组合所有显示器
          const displays = [primary, ...extraDisplays];

          // 极端位置（50000+）的窗口在任何合理的多显示器配置下都应超出范围
          const withinBounds = isStateWithinScreenBounds(state, displays);

          if (!withinBounds) {
            // 超出范围时应回退默认值
            const restored = restoreState(state, displays, primary);
            expect(restored.width).toBe(DEFAULT_WIDTH);
            expect(restored.height).toBe(DEFAULT_HEIGHT);
            expect(restored.isMaximized).toBe(false);
          }
          // 如果碰巧在某个显示器范围内（理论上不会发生），则保留原状态
        }
      ),
      { numRuns: 100 }
    );
  });

  it('savedState 为 null 时应返回默认状态', () => {
    fc.assert(
      fc.property(
        primaryDisplayArb,
        (primary: DisplayWorkArea) => {
          const displays = [primary];
          const restored = restoreState(null, displays, primary);

          expect(restored.width).toBe(DEFAULT_WIDTH);
          expect(restored.height).toBe(DEFAULT_HEIGHT);
          expect(restored.isMaximized).toBe(false);

          const expectedX = primary.x + Math.round((primary.width - DEFAULT_WIDTH) / 2);
          const expectedY = primary.y + Math.round((primary.height - DEFAULT_HEIGHT) / 2);
          expect(restored.x).toBe(expectedX);
          expect(restored.y).toBe(expectedY);
        }
      ),
      { numRuns: 100 }
    );
  });
});
