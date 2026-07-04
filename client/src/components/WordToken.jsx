import React, { useCallback } from 'react';

// 背景色配色方案（用户未确认的词）
const BACKGROUND_COLORS = {
  1: '',                              // 已掌握，无样式
  3: 'bg-cyan-200 dark:bg-cyan-800',    // 青色 - 简单
  5: 'bg-amber-200 dark:bg-amber-700',  // 琥珀色 - 较难
  7: 'bg-rose-200 dark:bg-rose-800 underline decoration-rose-500 decoration-wavy', // 玫瑰色 - 陌生
};

// 前景色配色方案（用户已确认的词）
const FOREGROUND_COLORS = {
  1: 'text-gray-600 dark:text-gray-400',  // 已掌握
  3: 'text-cyan-600 dark:text-cyan-400',     // 青色
  5: 'text-amber-600 dark:text-amber-400',   // 琥珀色
  7: 'text-rose-600 dark:text-rose-400 underline decoration-rose-500 decoration-wavy', // 玫瑰色
};

// 生成 tooltip 文本
function getTooltip(token) {
  if (token.word_id == null) {
    return '⚠️ 词典中不存在，点击添加';
  }

  const parts = [];

  // 用 token 级别的翻译
  if (token.translation) {
    parts.push(token.translation);
  }

  // 回退到 lemma
  if (parts.length === 0) {
    parts.push(token.lemma || token.text);
  }

  // 添加 COCA 排名
  if (token.coca_rank > 0) {
    parts.push(`[COCA #${token.coca_rank}]`);
  }

  return parts.join(' ');
}

const WordToken = React.memo(function WordToken({ token, hasAnnotation, onClick, isConfirmed }) {
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onClick && onClick(token);
  }, [token, onClick]);

  // OOV单词：word_id为null表示系统计算时未在词典中找到
  const isOOV = token.word_id == null;

  // 根据是否已确认选择前景色或背景色
  const colorClass = isConfirmed
    ? (FOREGROUND_COLORS[token.strangeness] || '')
    : (BACKGROUND_COLORS[token.strangeness] || '');
  const isWord = token.is_word !== false;

  if (!isWord) {
    return <span>{token.text}</span>;
  }

  // OOV单词特殊样式
  const oovClass = isOOV ? 'italic font-bold text-xl dark:text-yellow-400' : '';

  return (
    <span
      className={`cursor-pointer rounded-sm px-0.5 py-0.5 transition-colors hover:opacity-80 ${colorClass} ${
        hasAnnotation ? 'border-b-2 border-blue-500' : ''
      } ${oovClass}`}
      onClick={handleClick}
      title={getTooltip(token)}
      data-word-id={token.word_id || ''}
      data-start-char={token.start_char ?? ''}
      data-end-char={token.end_char ?? ''}
    >
      {token.text}
    </span>
  );
});

export default WordToken;
