/**
 * 文件夹排序工具
 * 主进程（file-system-service）与渲染进程（directory-tree）共享，
 * 确保两端排序规则一致
 */

/**
 * 判断字符是否为 ASCII 字母
 */
function isAsciiLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * 文件夹名称排序比较函数
 * 规则：不区分大小写字典序，英文字母优先于中文字符
 *
 * 排序逻辑：
 * 1. 如果两个名称首字符类型相同（都是英文或都是非英文），按 localeCompare 不区分大小写排序
 * 2. 如果首字符类型不同，英文字母开头的排在前面
 */
export function compareFolderNames(a: string, b: string): number {
  const aIsAscii = a.length > 0 && isAsciiLetter(a[0]);
  const bIsAscii = b.length > 0 && isAsciiLetter(b[0]);

  // 英文字母开头的排在中文字符开头的前面
  if (aIsAscii && !bIsAscii) return -1;
  if (!aIsAscii && bIsAscii) return 1;

  // 同类型按不区分大小写字典序排列
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}
