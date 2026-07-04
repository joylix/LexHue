import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { renderTokens } from '../utils/tokenRenderer';
import VocabDetailPopup from '../components/VocabDetailPopup';

import { STRANGENESS, STRANGENESS_BG, STRANGENESS_FG, STRANGENESS_DOT, STRANGENESS_LEVELS } from '../constants/strangeness';

const ARTICLE_DIFFICULTY_MIN_ABOVE_RATIO = 0.01;
const ARTICLE_DIFFICULTY_MAX_ABOVE_RATIO = 0.15;

// 辅助：获取陌生度样式
const sBg = (lv) => STRANGENESS_BG[lv] || 'bg-gray-100 dark:bg-gray-700';
const sFg = (lv) => STRANGENESS_FG[lv] || 'text-gray-600 dark:text-gray-300';
const sLabel = (lv) => STRANGENESS[lv]?.label || lv;

export default function Reading() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showVocabPopup, setShowVocabPopup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 用户已确认的单词 ID 集合（用于区分前景色/背景色显示）
  const [confirmedWordIds, setConfirmedWordIds] = useState(new Set());
  // 用户等级（用于筛选超纲词汇）
  const [userLevel, setUserLevel] = useState(null);

  // 划选标注陌生度
  const [selectionMenu, setSelectionMenu] = useState(null);
  const articleRef = useRef(null);

  // 加载用户已确认的词汇（confirmed = 1）
  const loadConfirmedWords = useCallback(async () => {
    try {
      const data = await api.get('/vocab?page=1&limit=10000');
      const result = data?.data || data || {};
      const vocabList = Array.isArray(result.items) ? result.items : (Array.isArray(result) ? result : []);
      // 只有 confirmed = 1 的词才显示为前景色
      const confirmedIds = new Set(vocabList.filter(v => v.confirmed === 1 || v.confirmed === true).map(v => v.word_id));
      setConfirmedWordIds(confirmedIds);
    } catch (e) {
      console.error('Failed to load confirmed words:', e);
    }
  }, []);

  const loadArticle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/articles/${articleId}`);
      const result = data?.data || data;
      setArticle(result);
      setTokens(result.tokenized || []);
      setAnnotations(result.annotations || []);

      // 异步批量计算陌生度
      const wordTokens = (result.tokenized || []).filter(t => t.is_word);
      if (wordTokens.length > 0) {
        // 去重：同一个 word_id 只请求一次
        const uniqueWords = new Map();
        wordTokens.forEach(t => {
          const key = t.word_id || t.lemma;
          if (!uniqueWords.has(key)) {
            uniqueWords.set(key, { word_id: t.word_id, lemma: t.lemma, standard_level: t.standard_level });
          }
        });
        const words = Array.from(uniqueWords.values());

        // 分批请求，每批 500 个词
        const batchSize = 500;
        const strangenessMap = new Map(); // word_id -> strangeness
        for (let i = 0; i < words.length; i += batchSize) {
          const batch = words.slice(i, i + batchSize);
          try {
            const res = await api.post(`/articles/${articleId}/calculate-strangeness`, { words: batch });
            const results = res?.data || [];
            results.forEach((r, idx) => {
              const w = batch[idx];
              strangenessMap.set(w.word_id || w.lemma, r.strangeness);
            });
          } catch (e) {
            console.error('Failed to calculate strangeness batch:', e);
          }
        }

        // 更新 tokens 的陌生度
        setTokens(prev => prev.map(t => {
          if (!t.is_word) return t;
          const key = t.word_id || t.lemma;
          const strangeness = strangenessMap.get(key);
          if (strangeness !== undefined) {
            return { ...t, strangeness };
          }
          return t;
        }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    loadArticle();
    loadConfirmedWords();
    // 加载用户等级
    api.get('/config').then(data => {
      const config = data?.data || data || {};
      setUserLevel(parseInt(config.user_level || '3', 10));
    }).catch(() => {});
  }, [loadArticle, loadConfirmedWords]);

  // 统计各陌生度的词汇数量（按唯一 word_id 去重）
  const strangenessCounts = React.useMemo(() => {
    const counts = { 1: 0, 3: 0, 5: 0, 7: 0 };
    const seen = new Set();
    for (const t of tokens) {
      if (t.is_word && t.word_id && !seen.has(t.word_id)) {
        seen.add(t.word_id);
        const s = t.strangeness;
        if (counts[s] !== undefined) counts[s]++;
      }
    }
    return counts;
  }, [tokens]);

  const totalCountedWords = React.useMemo(
    () => Object.values(strangenessCounts).reduce((sum, count) => sum + count, 0),
    [strangenessCounts]
  );

  const formatCountWithPercent = useCallback((count, total = totalCountedWords) => {
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    return `${count} / ${percent}%`;
  }, [totalCountedWords]);

  // Article difficulty is computed against the selected article level itself:
  // for each candidate level, count words whose standard_level is above that level.
  const articleDifficulty = React.useMemo(() => {
    const wordsById = new Map();
    for (const token of tokens) {
      if (!token.is_word || !token.word_id) continue;
      if (token.standard_level === null || token.standard_level === undefined) continue;
      if (!wordsById.has(token.word_id)) {
        wordsById.set(token.word_id, token.standard_level);
      }
    }

    const levels = Array.from(wordsById.values());
    const total = levels.length;
    if (total === 0) return null;

    const candidates = [];
    for (let level = 0; level <= 9; level++) {
      const aboveCount = levels.filter(standardLevel => standardLevel > level).length;
      const ratio = aboveCount / total;
      if (ratio > ARTICLE_DIFFICULTY_MIN_ABOVE_RATIO && ratio < ARTICLE_DIFFICULTY_MAX_ABOVE_RATIO) {
        candidates.push({ level, aboveCount, ratio });
      }
    }

    const selected = candidates[0] || {
      level: levels.every(standardLevel => standardLevel <= 0) ? 0 : 9,
      aboveCount: candidates.length === 0 ? levels.filter(standardLevel => standardLevel > 9).length : 0,
      ratio: candidates.length === 0 ? 0 : 0,
    };

    return {
      ...selected,
      total,
      percent: Math.round(selected.ratio * 100),
    };
  }, [tokens]);

  const handleTokenClick = useCallback((token) => {
    if (token.is_word) {
      setSelectedToken(token);
      setShowVocabPopup(true);
    }
  }, []);

  const handleStrangenessChange = useCallback(() => {
    loadArticle();
    loadConfirmedWords();
  }, [loadArticle, loadConfirmedWords]);
  // 鼠标划选处理
  const handleMouseUp = useCallback((e) => {
    if (e.target.closest('[data-selection-menu]')) return;

    const selection = window.getSelection();
    if (selection.isCollapsed) {
      setSelectionMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const articleEl = articleRef.current;
    if (!articleEl || !articleEl.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null);
      return;
    }

    const rawText = selection.toString();
    if (!rawText || rawText.trim().length === 0) {
      setSelectionMenu(null);
      return;
    }

    // 计算选区在文章中的字符偏移
    // 方法：遍历所有文本节点，累加偏移量
    let startChar = 0;
    let endChar = 0;
    let foundStart = false;

    const walker = document.createTreeWalker(articleEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!foundStart) {
        if (node === range.startContainer) {
          startChar += range.startOffset;
          foundStart = true;
          // 如果 start 和 end 在同一个节点
          if (node === range.endContainer) {
            endChar = startChar + (range.endOffset - range.startOffset);
            break;
          }
        } else {
          startChar += node.textContent.length;
        }
      } else {
        if (node === range.endContainer) {
          endChar = startChar + range.endOffset;
          break;
        } else {
          startChar += node.textContent.length;
        }
      }
    }

    // 如果 endChar 没计算出来（异常情况），用文本长度估算
    if (endChar === 0) {
      endChar = startChar + rawText.length;
    }

    // 扩展选区边界到完整单词
    const expandedText = article?.content?.slice(startChar, endChar);
    if (!expandedText || expandedText.trim().length === 0) {
      setSelectionMenu(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    // 找到选中范围内的第一个有 word_id 的 token
    const selectedTokens = tokens.filter(t =>
      t.is_word &&
      t.start_char >= startChar &&
      t.end_char <= endChar
    );

    if (selectedTokens.length === 0) {
      setSelectionMenu(null);
      return;
    }

    const firstToken = selectedTokens[0];
    const wordId = firstToken.word_id;
    const lemma = firstToken.lemma || firstToken.text;

    // 立即显示快捷菜单（只有陌生度按钮）
    setSelectionMenu({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text: expandedText,
      startChar,
      endChar,
      token: firstToken,
      wordId,
      lemma,
      detail: null, // 先不显示详情
      currentStrangeness: firstToken.strangeness || null,
      originalStrangeness: firstToken.strangeness || null,
      dirty: false,
    });

    // 后台获取详情
    if (wordId) {
      api.get(`/dictionary/${wordId}`).then(data => {
        const detail = data?.data || data;
        if (detail && detail.word_id) {
          setSelectionMenu(prev => prev ? { ...prev, detail } : null);
        }
      }).catch(() => {
        // 忽略错误，保持快捷菜单
      });
    }
  }, [article, tokens]);

  // 划选后调整陌生度（方向式）
  const handleSelectionStrangenessDirection = useCallback(async (direction) => {
    if (!selectionMenu) return;

    const wordId = selectionMenu.wordId;
    const tokenText = selectionMenu.text;

    try {
      if (wordId) {
        // 已有词典记录，直接调整陌生度
        const result = await api.put(`/vocab/${wordId}/strangeness`, {
          direction,
          current_strangeness: selectionMenu.currentStrangeness,
        });
        if (result?.data?.newStrangeness !== undefined) {
          setSelectionMenu(prev => prev ? {
            ...prev,
            currentStrangeness: result.data.newStrangeness,
          } : null);
          // 本地更新 confirmedWordIds，避免全量重新加载
          setConfirmedWordIds(prev => new Set(prev).add(wordId));
          loadArticle();
          return;
        }
      } else {
        // OOV 词：先添加到词典，再调整陌生度
        const addResult = await api.post('/dictionary/auto-add', {
          word: tokenText,
          strangeness: selectionMenu.currentStrangeness || 7,
        });
        if (addResult?.data?.word_id) {
          const newWordId = addResult.data.word_id;
          const result = await api.put(`/vocab/${newWordId}/strangeness`, {
            direction,
            current_strangeness: selectionMenu.currentStrangeness || 7,
          });
          if (result?.data?.newStrangeness !== undefined) {
            setSelectionMenu(prev => prev ? {
              ...prev,
              wordId: newWordId,
              currentStrangeness: result.data.newStrangeness,
            } : null);
            // 本地更新 confirmedWordIds
            setConfirmedWordIds(prev => new Set(prev).add(newWordId));
            loadArticle();
            return;
          }
        }
      }
    } catch (e) {
      console.error('Failed to adjust strangeness:', e);
    }
  }, [selectionMenu, loadArticle]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={() => navigate('/articles')} className="text-blue-600 hover:underline">
          返回文章列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="mb-4">
          <button onClick={() => navigate('/articles')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-1">
            ← 返回列表
          </button>
          <div className="mb-2">
            <div className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">难度等级：</span>
              <span className="text-2xl font-bold text-amber-800 dark:text-amber-200">
                {articleDifficulty ? `Level ${articleDifficulty.level}` : '待计算'}
              </span>
              {articleDifficulty && (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  高于本等级词 {articleDifficulty.aboveCount} / {articleDifficulty.percent}%
                </span>
              )}
            </div>
          </div>
          <h1 className="text-xl font-bold">{article?.title}</h1>
        </div>

        {/* Article content */}
        <div
          ref={articleRef}
          data-article-content
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 leading-relaxed text-lg select-text"
          onMouseUp={handleMouseUp}
        >
          {tokens.length > 0 ? (
            <div className="whitespace-pre-wrap">
              {renderTokens(tokens, annotations, handleTokenClick, confirmedWordIds)}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{article?.content}</p>
          )}
        </div>

        {/* User new words are relative to the user's own level, not the article difficulty level above. */}
        {userLevel !== null && tokens.length > 0 && (() => {
          // 筛选 standard_level > userLevel 的单词，按 word_id 去重
          const seen = new Map();
          for (const t of tokens) {
            if (!t.is_word || !t.word_id) continue;
            if ((t.standard_level ?? 0) <= userLevel) continue;
            if (!seen.has(t.word_id)) {
              seen.set(t.word_id, {
                word_id: t.word_id,
                lemma: t.lemma || t.text,
                text: t.text,
                standard_level: t.standard_level,
                strangeness: t.strangeness,
                pos: t.pos || '',
                translation: t.translation || '',
              });
            }
          }
          const hardWords = Array.from(seen.values());
          if (hardWords.length === 0) return null;
          const targetLevels = [
            { level: 7, label: '陌生' },
            { level: 5, label: '初识' },
          ];
          // 按 standard_level 降序排列（最难的在前）
          hardWords.sort((a, b) => (b.standard_level ?? 0) - (a.standard_level ?? 0));
          // 按陌生度分组
          const grouped = {};
          for (const w of hardWords) {
            const s = w.strangeness;
            if (!targetLevels.some(item => item.level === s)) continue;
            if (!grouped[s]) grouped[s] = [];
            grouped[s].push(w);
          }
          const targetTotal = targetLevels.reduce((sum, item) => sum + (grouped[item.level]?.length || 0), 0);
          if (targetTotal === 0) return null;
          const articleWordTotal = totalCountedWords;
	          return (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
                您的生词（高于您的 Level {userLevel}）共 {formatCountWithPercent(targetTotal, articleWordTotal)}
              </h3>
              <div className="space-y-3">
                {targetLevels.map(({ level, label }) => {
                  const words = grouped[level];
                  if (!words || words.length === 0) return null;
                  return (
                    <div key={level}>
                      <div className={`text-xs font-medium mb-1 ${STRANGENESS_FG[level]}`}>
                        {label}（{formatCountWithPercent(words.length, articleWordTotal)}）
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {words.map(w => (
                          <button
                            key={w.word_id}
                            onClick={() => {
                              const token = tokens.find(t => t.word_id === w.word_id);
                              if (token) {
                                setSelectedToken(token);
                                setShowVocabPopup(true);
                              }
                            }}
                            className={`px-2 py-0.5 text-xs rounded ${STRANGENESS_BG[level]} ${STRANGENESS_FG[level]} hover:opacity-80 transition-colors`}
                            title={w.translation || w.lemma}
                          >
                            {w.lemma}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 space-y-4">
        {/* 阅读说明 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p><strong>📖 阅读说明</strong></p>
          <p>• <strong>点击单词</strong>：查看词典详情、音标、释义，可调整陌生度</p>
          <p>• <strong>拖拽选中文字</strong>：快速标注陌生度（无需打开详情弹窗）</p>
          <p>• <strong>难度</strong>：L0-L9，由词频计算（L0=最常用，L9=最生僻）</p>
          <p>• <strong>陌生度</strong>：掌握程度，分为 精通/熟识/浅知/陌生，可用 ↓↑ 按钮调整</p>
          <p>• <strong>默认标注</strong>：低于当前等级不标色，等于当前等级为熟识，高 1 级为浅知，高 2 级及以上为陌生</p>
        </div>

        {/* 页面词汇统计 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
          <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">页面词汇统计</h4>
          <div className="space-y-1.5">
            {STRANGENESS_LEVELS.map(level => (
              <div key={level} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-6 h-3 rounded ${STRANGENESS_BG[level]}`} />
                  <span className="text-gray-600 dark:text-gray-400">{STRANGENESS[level].label}</span>
                </div>
                <span className="font-medium">{formatCountWithPercent(strangenessCounts[level] || 0)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">总计</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {formatCountWithPercent(totalCountedWords)}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              <p>
                <span className={`px-1 rounded ${STRANGENESS_BG[5]} text-gray-700 dark:text-gray-100`}>背景色</span>
                ：表示——系统评估
              </p>
              <p>
                <span className={`font-medium ${STRANGENESS_FG[5]}`}>前景色</span>
                ：表示——已确认
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Vocab Detail Popup */}
      {showVocabPopup && (
        <VocabDetailPopup
          token={selectedToken}
          wordId={selectedToken?.word_id}
          lemma={selectedToken?.lemma}
          onClose={() => {
            setShowVocabPopup(false);
            setSelectedToken(null);
          }}
          onStrangenessChange={handleStrangenessChange}
        />
      )}

      {/* 划选陌生度菜单 - 与 VocabDetailPopup 一致 */}
      {selectionMenu && !selectionMenu.detail && (
        <div
          data-selection-menu
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2 min-w-[260px] max-w-[320px]"
          style={{
            left: Math.min(selectionMenu.x - 130, window.innerWidth - 340),
            top: Math.max(selectionMenu.y - 140, 10),
          }}
        >
          <div className="text-sm font-bold border-b border-gray-200 dark:border-gray-700 pb-2">
            {selectionMenu.lemma || selectionMenu.text}
          </div>
          {selectionMenu.currentStrangeness !== null ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">当前陌生度:</span>
                <span className={`px-2 py-0.5 text-xs rounded ${sBg(selectionMenu.currentStrangeness) || 'bg-gray-100 dark:bg-gray-700'} ${sFg(selectionMenu.currentStrangeness) || 'text-gray-600 dark:text-gray-300'}`}>
                  {sLabel(selectionMenu.currentStrangeness) || selectionMenu.currentStrangeness}
                </span>
                {selectionMenu.dirty && <span className="text-xs text-orange-500">(未提交)</span>}
              </div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => {
                    const newVal = Math.max(1, selectionMenu.currentStrangeness - 2);
                    setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: newVal, dirty: true } : null);
                  }}
                  disabled={selectionMenu.currentStrangeness <= 1}
                  className="flex-1 px-2 py-2 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  降低 ↓
                </button>
                <button
                  onClick={() => {
                    setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: selectionMenu.originalStrangeness, dirty: true } : null);
                  }}
                  className="flex-1 px-2 py-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                  复原
                </button>
                <button
                  onClick={() => {
                    const newVal = Math.min(7, selectionMenu.currentStrangeness + 2);
                    setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: newVal, dirty: true } : null);
                  }}
                  disabled={selectionMenu.currentStrangeness >= 7}
                  className="flex-1 px-2 py-2 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  提高 ↑
                </button>
              </div>
              {selectionMenu.dirty && (
                <button
                  onClick={async () => {
                    if (!selectionMenu) return;
                    const wordId = selectionMenu.wordId;
                    const tokenText = selectionMenu.text;
                    const current = selectionMenu.currentStrangeness;
                    const original = selectionMenu.originalStrangeness;

                    try {
                      if (wordId) {
                        await api.put(`/vocab/${wordId}/strangeness`, {
                          direction: current > original ? 'up' : current < original ? 'down' : 'keep',
                          current_strangeness: original,
                        });
                      } else {
                        const addResult = await api.post('/dictionary/auto-add', { word: tokenText });
                        if (addResult?.data?.word_id) {
                          const newWordId = addResult.data.word_id;
                          await api.put(`/vocab/${newWordId}/strangeness`, {
                            direction: current > original ? 'up' : current < original ? 'down' : 'keep',
                            current_strangeness: original,
                          });
                        }
                      }
                      setSelectionMenu(null);
                      loadArticle();
                    } catch (e) {
                      console.error('Failed to submit strangeness:', e);
                    }
                  }}
                  className="w-full px-2 py-2 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  提交修改
                </button>
              )}
            </>
          ) : (
            <>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectionMenu.wordId ? '点击设置陌生度' : '新词 - 点击添加到词典并设置陌生度'}
              </div>
              {STRANGENESS_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => {
                    setSelectionMenu(prev => prev ? {
                      ...prev,
                      currentStrangeness: level,
                      originalStrangeness: level,
                      dirty: false,
                    } : null);
                  }}
                  className={`px-3 py-2 text-xs rounded transition-colors text-left ${STRANGENESS_BG[level]} ${STRANGENESS_FG[level]} hover:opacity-80`}
                >
                  {STRANGENESS[level].label}
                </button>
              ))}
            </>
          )}
          <button
            onClick={() => setSelectionMenu(null)}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-center mt-1"
          >
            ✕ 取消
          </button>
        </div>
      )}

      {/* 划选词详情弹窗 - 与 VocabDetailPopup 一致 */}
      {selectionMenu && selectionMenu.detail && (
        <div
          data-selection-menu
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{selectionMenu.detail.lemma || selectionMenu.lemma}</h3>
              <button
                onClick={() => setSelectionMenu(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* 音标 */}
              {(selectionMenu.detail.phonetic_us || selectionMenu.detail.phonetic_uk) && (
                <div className="flex items-center gap-4">
                  {selectionMenu.detail.phonetic_us && (
                    <span className="text-sm">🔊 美 [{selectionMenu.detail.phonetic_us}]</span>
                  )}
                  {selectionMenu.detail.phonetic_uk && (
                    <span className="text-sm">🔊 英 [{selectionMenu.detail.phonetic_uk}]</span>
                  )}
                </div>
              )}

              {/* 释义 */}
              {(selectionMenu.detail.translation || selectionMenu.detail.definition_en) && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">释义</label>
                  <div className="mt-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    {selectionMenu.detail.definition_en && (
                      <p className="text-sm">{selectionMenu.detail.definition_en}</p>
                    )}
                    {selectionMenu.detail.translation && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{selectionMenu.detail.translation}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 难度级别 */}
              {selectionMenu.detail.standard_level !== null && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">难度级别</label>
                  <p className="mt-1">
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                      L{selectionMenu.detail.standard_level}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {selectionMenu.detail.standard_level <= 2 ? '基础词汇' : selectionMenu.detail.standard_level <= 5 ? '中等词汇' : selectionMenu.detail.standard_level <= 7 ? '进阶词汇' : '生僻词汇'}
                    </span>
                  </p>
                </div>
              )}

              {/* 近义词 */}
              {selectionMenu.detail.synonyms && selectionMenu.detail.synonyms.length > 0 && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">近义词</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectionMenu.detail.synonyms.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded">
                        {s.lemma}{s.pos ? ` (${s.pos})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 反义词 */}
              {selectionMenu.detail.antonyms && selectionMenu.detail.antonyms.length > 0 && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">反义词</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectionMenu.detail.antonyms.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded">
                        {a.lemma}{a.pos ? ` (${a.pos})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 陌生度操作 - 与 VocabDetailPopup 一致 */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">当前陌生度:</span>
                  <span className={`px-2 py-0.5 text-sm rounded ${sBg(selectionMenu.currentStrangeness) || 'bg-gray-100 dark:bg-gray-700'} ${sFg(selectionMenu.currentStrangeness) || 'text-gray-600 dark:text-gray-300'}`}>
                    {sLabel(selectionMenu.currentStrangeness) || selectionMenu.currentStrangeness}
                  </span>
                  {selectionMenu.dirty && <span className="text-xs text-orange-500">(未提交)</span>}
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      const newVal = Math.max(1, selectionMenu.currentStrangeness - 2);
                      setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: newVal, dirty: true } : null);
                    }}
                    disabled={selectionMenu.currentStrangeness <= 1}
                    className="flex-1 px-3 py-2 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    降低 ↓
                  </button>
                  <button
                    onClick={() => {
                      setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: selectionMenu.originalStrangeness, dirty: true } : null);
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  >
                    复原
                  </button>
                  <button
                    onClick={() => {
                      const newVal = Math.min(7, selectionMenu.currentStrangeness + 2);
                      setSelectionMenu(prev => prev ? { ...prev, currentStrangeness: newVal, dirty: true } : null);
                    }}
                    disabled={selectionMenu.currentStrangeness >= 7}
                    className="flex-1 px-3 py-2 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    提高 ↑
                  </button>
                </div>
                {selectionMenu.dirty && (
                  <button
                    onClick={async () => {
                      if (!selectionMenu) return;
                      const wordId = selectionMenu.wordId;
                      const current = selectionMenu.currentStrangeness;
                      const original = selectionMenu.originalStrangeness;
                      try {
                        if (wordId) {
                          await api.put(`/vocab/${wordId}/strangeness`, {
                            direction: current > original ? 'up' : current < original ? 'down' : 'keep',
                            current_strangeness: original,
                          });
                        }
                        setSelectionMenu(null);
                        loadArticle();
                      } catch (e) {
                        console.error('Failed to submit strangeness:', e);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    提交修改
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
