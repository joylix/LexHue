import React from 'react';
import { STRANGENESS, STRANGENESS_BG, STRANGENESS_LEVELS } from '../constants/strangeness';

const LEGEND_ITEMS = STRANGENESS_LEVELS.map(level => ({
  level,
  label: STRANGENESS[level].label,
  bgClass: STRANGENESS_BG[level],
}));

export default function ColorLegend() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
      <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">颜色图例</h4>
      <div className="space-y-1.5">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.level} className="flex items-center gap-2 text-xs">
            <span className={`inline-block w-6 h-4 rounded ${item.bgClass}`} />
            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
