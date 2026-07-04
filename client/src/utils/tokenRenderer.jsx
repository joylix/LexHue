import React from 'react';
import WordToken from '../components/WordToken';

/**
 * 将 token 数组渲染为 React 元素列表。
 * 连续 strangeness=1 且无批注、非缩写、非短语的 token 合并为纯文本字符串，
 * 减少 DOM 节点数量，提升渲染性能。
 *
 * @param {Array} tokens - token 数组
 * @param {Array} annotations - 批注数组
 * @param {Function} onTokenClick - 点击回调
 * @param {Set} confirmedWordIds - 用户已确认的单词 ID 集合
 */
export function renderTokens(tokens, annotations, onTokenClick, confirmedWordIds = new Set()) {
  if (!tokens || tokens.length === 0) return [];

  const elements = [];
  let plainTextBuffer = '';
  let plainTextKey = 0;

  const flushPlainText = () => {
    if (plainTextBuffer) {
      elements.push(
        <span key={`plain-${plainTextKey++}`}>{plainTextBuffer}</span>
      );
      plainTextBuffer = '';
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const hasAnnotation = annotations && annotations.some(
      a => a.start_char_index <= token.start_char && a.end_char_index >= token.end_char
    );

    // 判断是否为"低级"token：strangeness=1、无批注、非缩写、非短语
    const isLowLevel =
      token.strangeness === 1 &&
      !hasAnnotation &&
      !token.is_abbreviation &&
      !token.phrase_group_id;

    // 判断该词是否已被用户确认
    const isConfirmed = token.word_id && confirmedWordIds.has(token.word_id);

    if (isLowLevel && token.is_word !== false) {
      // 合并到纯文本缓冲区
      plainTextBuffer += token.text;
    } else {
      flushPlainText();
      elements.push(
        <WordToken
          key={`token-${i}`}
          token={token}
          hasAnnotation={hasAnnotation}
          onClick={onTokenClick}
          isConfirmed={isConfirmed}
        />
      );
    }
  }

  flushPlainText();
  return elements;
}
