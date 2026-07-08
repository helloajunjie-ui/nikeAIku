// ============================================================
// useDebounce — 通用防抖 Hook
// ============================================================
import { useEffect, useState } from 'react';

/**
 * 防抖值：value 变化后延迟 delay ms 才更新返回值
 * 用于搜索输入防抖，避免每次敲击都触发 API 请求
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
