import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ['tests/**/*.{test,spec,prop}.ts'],
    // 超时时间（属性测试可能需要更长时间）
    testTimeout: 30000,
    // 路径别名
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
