/**
 * Property 7: 展开/折叠往返
 *
 * 对于任意可展开的文件夹节点，执行展开操作后再执行折叠操作，
 * Directory_Tree 应恢复到展开前的视觉状态（子节点隐藏）。
 *
 * **Validates: Requirements 2.3, 2.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * 树节点状态模型（与 DirectoryTree 组件中的 TreeNodeState 对应）
 * 用于测试展开/折叠的状态逻辑，无需依赖 DOM
 */
interface TreeNodeState {
  path: string;
  name: string;
  expanded: boolean;
  loaded: boolean;
  accessible: boolean;
  hasChildren: boolean;
  children: TreeNodeState[];
}

/**
 * 模拟展开操作：将节点标记为已展开
 * 对应 DirectoryTree.expandNode 的状态变更逻辑
 */
function expandNode(node: TreeNodeState): TreeNodeState {
  if (!node.accessible || !node.hasChildren) {
    // 不可访问或无子节点的节点不能展开
    return node;
  }
  return {
    ...node,
    expanded: true,
    loaded: true,
  };
}

/**
 * 模拟折叠操作：将节点标记为已折叠
 * 对应 DirectoryTree.collapseNode 的状态变更逻辑
 */
function collapseNode(node: TreeNodeState): TreeNodeState {
  return {
    ...node,
    expanded: false,
  };
}

/**
 * 判断子节点容器是否应该隐藏（对应 DOM 中 'expanded' class 的移除）
 * 当 expanded === false 时，子节点容器隐藏
 */
function isChildrenHidden(node: TreeNodeState): boolean {
  return !node.expanded;
}

/**
 * 生成合法的文件夹路径
 */
const pathArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 15 }
).map((name) => `C:\\test\\${name}`);

/**
 * 生成可展开的树节点（accessible=true, hasChildren=true）
 */
const expandableNodeArb = fc.record({
  path: pathArb,
  name: fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 10 }
  ),
  expanded: fc.constant(false),
  loaded: fc.constant(false),
  accessible: fc.constant(true),
  hasChildren: fc.constant(true),
  children: fc.constant([] as TreeNodeState[]),
});

/**
 * 生成带有子节点的树节点
 */
const nodeWithChildrenArb = fc.record({
  path: pathArb,
  name: fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 10 }
  ),
  expanded: fc.constant(false),
  loaded: fc.constant(false),
  accessible: fc.constant(true),
  hasChildren: fc.constant(true),
  children: fc.array(
    fc.record({
      path: pathArb,
      name: fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        { minLength: 1, maxLength: 10 }
      ),
      expanded: fc.constant(false),
      loaded: fc.constant(false),
      accessible: fc.boolean(),
      hasChildren: fc.boolean(),
      children: fc.constant([] as TreeNodeState[]),
    }),
    { minLength: 1, maxLength: 10 }
  ),
});

/**
 * 生成展开/折叠操作序列
 * true = 展开, false = 折叠
 */
const operationSequenceArb = fc.array(fc.boolean(), { minLength: 2, maxLength: 20 });

describe('Property 7: 展开/折叠往返', () => {
  /**
   * 核心属性：展开后折叠，节点恢复到展开前的视觉状态
   * Validates: Requirements 2.3, 2.4
   */
  it('对任意可展开节点，展开后折叠应恢复到初始视觉状态（子节点隐藏）', () => {
    fc.assert(
      fc.property(expandableNodeArb, (initialNode) => {
        // 初始状态：节点未展开，子节点隐藏
        expect(initialNode.expanded).toBe(false);
        expect(isChildrenHidden(initialNode)).toBe(true);

        // 执行展开操作
        const expandedNode = expandNode(initialNode);
        expect(expandedNode.expanded).toBe(true);
        expect(isChildrenHidden(expandedNode)).toBe(false);

        // 执行折叠操作
        const collapsedNode = collapseNode(expandedNode);

        // 验证：折叠后恢复到展开前的视觉状态
        expect(collapsedNode.expanded).toBe(false);
        expect(isChildrenHidden(collapsedNode)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('带有子节点的节点，展开后折叠，expanded 状态恢复为 false', () => {
    fc.assert(
      fc.property(nodeWithChildrenArb, (initialNode) => {
        // 初始状态验证
        expect(initialNode.expanded).toBe(false);

        // 展开
        const expandedNode = expandNode(initialNode);
        expect(expandedNode.expanded).toBe(true);
        // 展开后子节点应可见（容器不隐藏）
        expect(isChildrenHidden(expandedNode)).toBe(false);

        // 折叠
        const collapsedNode = collapseNode(expandedNode);

        // 验证往返：折叠后子节点隐藏
        expect(collapsedNode.expanded).toBe(false);
        expect(isChildrenHidden(collapsedNode)).toBe(true);
        // 子节点数据仍然保留（loaded 状态不变）
        expect(collapsedNode.loaded).toBe(true);
        expect(collapsedNode.children).toEqual(initialNode.children);
      }),
      { numRuns: 100 }
    );
  });

  it('对任意展开/折叠操作序列，最终以折叠结束时子节点始终隐藏', () => {
    fc.assert(
      fc.property(expandableNodeArb, operationSequenceArb, (initialNode, operations) => {
        let currentNode = initialNode;

        // 执行操作序列
        for (const shouldExpand of operations) {
          if (shouldExpand) {
            currentNode = expandNode(currentNode);
          } else {
            currentNode = collapseNode(currentNode);
          }
        }

        // 最后执行一次展开再折叠
        const expandedNode = expandNode(currentNode);
        const finalNode = collapseNode(expandedNode);

        // 验证：无论之前经历了什么操作序列，展开后折叠总是恢复到隐藏状态
        expect(finalNode.expanded).toBe(false);
        expect(isChildrenHidden(finalNode)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('不可访问的节点执行展开操作后状态不变', () => {
    const inaccessibleNodeArb = fc.record({
      path: pathArb,
      name: fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        { minLength: 1, maxLength: 10 }
      ),
      expanded: fc.constant(false),
      loaded: fc.constant(false),
      accessible: fc.constant(false),
      hasChildren: fc.boolean(),
      children: fc.constant([] as TreeNodeState[]),
    });

    fc.assert(
      fc.property(inaccessibleNodeArb, (node) => {
        // 对不可访问节点执行展开
        const afterExpand = expandNode(node);

        // 验证：状态不变
        expect(afterExpand.expanded).toBe(false);
        expect(afterExpand.loaded).toBe(false);
        expect(isChildrenHidden(afterExpand)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('无子节点的节点执行展开操作后状态不变', () => {
    const leafNodeArb = fc.record({
      path: pathArb,
      name: fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        { minLength: 1, maxLength: 10 }
      ),
      expanded: fc.constant(false),
      loaded: fc.constant(false),
      accessible: fc.constant(true),
      hasChildren: fc.constant(false),
      children: fc.constant([] as TreeNodeState[]),
    });

    fc.assert(
      fc.property(leafNodeArb, (node) => {
        // 对叶节点执行展开
        const afterExpand = expandNode(node);

        // 验证：状态不变
        expect(afterExpand.expanded).toBe(false);
        expect(afterExpand.loaded).toBe(false);
        expect(isChildrenHidden(afterExpand)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
