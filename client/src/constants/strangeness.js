// 陌生度配置 — 统一定义，所有组件引用此文件
export const STRANGENESS = {
  1: { label: '精通', color: 'gray' },
  3: { label: '熟识', color: 'cyan' },
  5: { label: '浅知', color: 'amber' },
  7: { label: '陌生', color: 'rose' },
};

// Tailwind 背景色 class
export const STRANGENESS_BG = {
  1: 'bg-gray-300 dark:bg-gray-600',
  3: 'bg-cyan-200 dark:bg-cyan-800',
  5: 'bg-amber-200 dark:bg-amber-700',
  7: 'bg-rose-200 dark:bg-rose-800',
};

// Tailwind 前景色 class
export const STRANGENESS_FG = {
  1: 'text-gray-700 dark:text-gray-300',
  3: 'text-cyan-600 dark:text-cyan-400',
  5: 'text-amber-600 dark:text-amber-400',
  7: 'text-rose-600 dark:text-rose-400',
};

// 圆点色
export const STRANGENESS_DOT = {
  1: 'bg-gray-400',
  3: 'bg-cyan-500',
  5: 'bg-amber-500',
  7: 'bg-rose-500',
};

// 所有等级值
export const STRANGENESS_LEVELS = [1, 3, 5, 7];
