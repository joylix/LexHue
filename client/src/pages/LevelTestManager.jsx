import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { renderTokens } from '../utils/tokenRenderer';
import { STRANGENESS, STRANGENESS_BG, STRANGENESS_FG, STRANGENESS_LEVELS } from '../constants/strangeness';

const LEVELS = Array.from({ length: 10 }, (_, i) => i);
const ARTICLE_MAX_CHARS = 10000;
const formatCount = (value) => value.toLocaleString('en-US');

function extractTitle(text) {
  if (!text) return '';
  const firstLine = text.split(/\n/).map(l => l.trim()).find(Boolean) || '';
  return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
}

export default function LevelTestManager() {
  const [texts, setTexts] = useState([]);
  const [expandedLevels, setExpandedLevels] = useState(() => new Set(LEVELS));
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState('paste');
  const [level, setLevel] = useState(4);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceInfo, setSourceInfo] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [selectedText, setSelectedText] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTexts = async () => {
    const res = await api.get('/level-test/admin/texts');
    setTexts(res.data || []);
  };

  useEffect(() => {
    loadTexts().catch(e => setError(e.message));
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const lv of LEVELS) map[lv] = [];
    for (const text of texts) {
      const lv = Math.max(0, Math.min(9, parseInt(text.level, 10)));
      map[lv].push(text);
    }
    return map;
  }, [texts]);

  const resetForm = () => {
    setMode('paste');
    setLevel(4);
    setTitle('');
    setContent('');
    setSourceUrl('');
    setSourceInfo(null);
    setAnalysis(null);
    setError(null);
  };

  const toggleLevel = (lv) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(lv)) next.delete(lv);
      else next.add(lv);
      return next;
    });
  };

  const handleExtractUrl = async () => {
    const url = sourceUrl.trim();
    if (!url) {
      setError('请输入网页链接');
      return;
    }

    setFetchingUrl(true);
    setError(null);
    setSourceInfo(null);
    setAnalysis(null);

    try {
      const data = await api.post('/level-test/admin/extract-url', { url });
      const article = data?.data || data;
      setContent(article.content || '');
      setSourceInfo(article);
      if (article.title) setTitle(article.title);
    } catch (e) {
      setError(e.message);
    } finally {
      setFetchingUrl(false);
    }
  };

  const analyze = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    if (trimmedContent.length > ARTICLE_MAX_CHARS) {
      setError(`文章内容不能超过 ${formatCount(ARTICLE_MAX_CHARS)} 个字符，当前为 ${formatCount(trimmedContent.length)} 个字符`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/level-test/admin/analyze', { title, content: trimmedContent });
      setAnalysis(res.data);
      if (res.data?.estimatedLevel !== undefined) setLevel(res.data.estimatedLevel);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    if (trimmedContent.length > ARTICLE_MAX_CHARS) {
      setError(`文章内容不能超过 ${formatCount(ARTICLE_MAX_CHARS)} 个字符，当前为 ${formatCount(trimmedContent.length)} 个字符`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let finalLevel = analysis?.estimatedLevel;
      if (finalLevel === undefined) {
        const res = await api.post('/level-test/admin/analyze', { title, content: trimmedContent });
        finalLevel = res.data?.estimatedLevel ?? level;
        setAnalysis(res.data);
      }

      await api.post('/level-test/admin/texts', {
        level: finalLevel,
        title: title.trim() || extractTitle(trimmedContent) || `Level ${finalLevel} 测评文章`,
        content: trimmedContent,
      });
      resetForm();
      setShowAdd(false);
      setExpandedLevels(prev => new Set(prev).add(finalLevel));
      await loadTexts();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (textId) => {
    if (!confirm('确定要删除这篇测评文章吗？')) return;
    await api.delete(`/level-test/admin/texts/${textId}`);
    if (selectedText?.text_id === textId) setSelectedText(null);
    await loadTexts();
  };

  const openDetail = async (textId) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await api.get(`/level-test/admin/texts/${textId}`);
      setSelectedText(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailStats = useMemo(() => {
    if (!selectedText?.tokens) return { counts: { 1: 0, 3: 0, 5: 0, 7: 0 }, total: 0, aboveWords: [] };
    const seen = new Map();
    for (const token of selectedText.tokens) {
      if (!token.is_word || !token.word_id) continue;
      if (!seen.has(token.word_id)) seen.set(token.word_id, token);
    }
    const counts = { 1: 0, 3: 0, 5: 0, 7: 0 };
    const aboveWords = [];
    for (const token of seen.values()) {
      const s = token.strangeness || 1;
      if (counts[s] !== undefined) counts[s]++;
      if ((token.standard_level ?? 0) > (selectedText.level ?? 0) && (s === 5 || s === 7)) {
        aboveWords.push(token);
      }
    }
    aboveWords.sort((a, b) => (b.standard_level ?? 0) - (a.standard_level ?? 0));
    return { counts, total: seen.size, aboveWords };
  }, [selectedText]);

  const formatDetailStat = (count) => {
    const percent = detailStats.total > 0 ? Math.round((count / detailStats.total) * 100) : 0;
    return `${count} / ${percent}%`;
  };

  const trimmedLength = content.trim().length;
  const isOverLimit = trimmedLength > ARTICLE_MAX_CHARS;
  const canSubmit = Boolean(content.trim()) && !loading && !isOverLimit;
  const detailPanel = selectedText && !detailLoading ? (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-gray-800 lg:rounded-lg shadow-xl lg:shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{selectedText.title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Level {selectedText.level} · {selectedText.source || 'admin'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedText(null)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
        <div className="prose dark:prose-invert max-w-none leading-relaxed whitespace-pre-wrap text-base select-text">
          {selectedText.tokens?.length ? renderTokens(selectedText.tokens, [], null, new Set()) : selectedText.content}
        </div>

        {detailStats.aboveWords.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
              本文超纲词（高于 Level {selectedText.level}）共 {formatDetailStat(detailStats.aboveWords.length)}
            </h3>
            <div className="space-y-3">
              {[7, 5].map(s => {
                const words = detailStats.aboveWords.filter(w => w.strangeness === s);
                if (words.length === 0) return null;
                return (
                  <div key={s}>
                    <div className={`text-xs font-medium mb-1 ${STRANGENESS_FG[s]}`}>
                      {STRANGENESS[s].label}（{formatDetailStat(words.length)}）
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {words.map(w => (
                        <span key={w.word_id} className={`px-2 py-0.5 text-xs rounded ${STRANGENESS_BG[s]} ${STRANGENESS_FG[s]}`} title={`L${w.standard_level}`}>
                          {w.lemma || w.text}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p><strong>标注说明</strong></p>
            <p>• 当前文章按 Level {selectedText.level} 计算词汇陌生度</p>
            <p>• 低于当前等级：不标色</p>
            <p>• 等于当前等级：熟识</p>
            <p>• 高于当前等级 1 级：浅知</p>
            <p>• 高于当前等级 2 级及以上：陌生</p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">页面词汇统计</h4>
            <div className="space-y-1.5">
              {STRANGENESS_LEVELS.map(s => (
                <div key={s} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-6 h-3 rounded ${STRANGENESS_BG[s]}`} />
                    <span className="text-gray-600 dark:text-gray-400">{STRANGENESS[s].label}</span>
                  </div>
                  <span className="font-medium">{formatDetailStat(detailStats.counts[s] || 0)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700 dark:text-gray-300">总计</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{formatDetailStat(detailStats.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">测评文章管理</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">按 Level 0-9 管理测评文章，新增文章会按系统自动评级保存。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showAdd) resetForm();
            setShowAdd(v => !v);
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
        >
          {showAdd ? '关闭添加' : '添加新测评文章'}
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">{error}</div>}

      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">添加测评文章</h2>
            {analysis && (
              <span className="text-sm px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                自动评级：Level {analysis.estimatedLevel}
              </span>
            )}
          </div>

          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('paste');
                setError(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'paste' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              粘贴文本
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('url');
                setError(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'url' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              网页链接
            </button>
          </div>

          {mode === 'url' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">网页链接</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => {
                    setSourceUrl(e.target.value);
                    setSourceInfo(null);
                    setAnalysis(null);
                    if (error) setError(null);
                  }}
                  placeholder="https://example.com/article"
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleExtractUrl}
                  disabled={fetchingUrl || !sourceUrl.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                >
                  {fetchingUrl ? '获取中...' : '获取正文'}
                </button>
              </div>
              {sourceInfo && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>来源：{sourceInfo.sourceUrl}</p>
                  <p>已提取 {formatCount(sourceInfo.contentLength || 0)} 个字符{sourceInfo.truncated ? `，原文约 ${formatCount(sourceInfo.originalLength || 0)} 个字符，已截断` : ''}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则使用正文首行"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">文章内容</label>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setAnalysis(null);
                if (error && e.target.value.trim().length <= ARTICLE_MAX_CHARS) setError(null);
              }}
              rows={14}
              placeholder="粘贴英文测评文章..."
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 font-mono text-sm outline-none focus:ring-2 ${isOverLimit ? 'border-red-400 dark:border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1 text-xs">
              <p className="text-gray-400">{content.trim() ? `标题预览：${title.trim() || extractTitle(content) || '未命名'}` : `上限：${formatCount(ARTICLE_MAX_CHARS)} 个字符`}</p>
              <p className={isOverLimit ? 'text-red-500' : 'text-gray-400'}>{formatCount(trimmedLength)} / {formatCount(ARTICLE_MAX_CHARS)}</p>
            </div>
          </div>

          {analysis && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
              <div>建议等级：<strong>Level {analysis.estimatedLevel}</strong></div>
              <div>唯一词数：{analysis.totalWords}</div>
              <div>高于建议等级词：{analysis.aboveCount} / {analysis.abovePercent}%</div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={analyze} disabled={!canSubmit} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
              {loading ? '处理中...' : '自动评级'}
            </button>
            <button onClick={save} disabled={!canSubmit} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
              按自动评级保存
            </button>
            <button type="button" onClick={() => { resetForm(); setShowAdd(false); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              取消
            </button>
          </div>
        </div>
      )}

      <div className={`grid gap-5 ${selectedText || detailLoading ? 'lg:grid-cols-[minmax(360px,1fr)_minmax(420px,48vw)]' : ''}`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
            测评文章目录
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {LEVELS.map(lv => {
              const items = grouped[lv] || [];
              const isOpen = expandedLevels.has(lv);
              return (
                <div key={lv}>
                  <button
                    type="button"
                    onClick={() => toggleLevel(lv)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="w-4 text-gray-500">{isOpen ? '▾' : '▸'}</span>
                    <span className="text-amber-500">{isOpen ? '📂' : '📁'}</span>
                    <span className="font-medium">Level {lv}</span>
                    <span className="ml-auto text-xs text-gray-400">{items.length} 篇</span>
                  </button>
                  {isOpen && (
                    <div className="bg-gray-50/70 dark:bg-gray-900/30">
                      {items.length === 0 ? (
                        <div className="pl-14 pr-4 py-2 text-sm text-gray-400">空目录</div>
                      ) : (
                        items.map(text => (
                          <div key={text.text_id} className="pl-14 pr-4 py-2 flex items-center gap-3 text-sm hover:bg-white dark:hover:bg-gray-800">
                            <span className="text-gray-400">📄</span>
                            <button
                              type="button"
                              onClick={() => openDetail(text.text_id)}
                              className={`min-w-0 flex-1 truncate text-left hover:text-blue-600 dark:hover:text-blue-400 ${selectedText?.text_id === text.text_id ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}
                              title={text.title}
                            >
                              {text.title}
                            </button>
                            <span className="hidden sm:inline text-xs text-gray-400 whitespace-nowrap">{new Date(text.created_at).toLocaleDateString()}</span>
                            <button onClick={() => remove(text.text_id)} className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap">
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:block">
          {detailLoading && (
            <div className="sticky top-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-500 dark:text-gray-400">
              正在加载文章详情...
            </div>
          )}
          {detailPanel && (
            <div className="sticky top-4 h-[calc(100vh-2rem)]">
              {detailPanel}
            </div>
          )}
        </div>
      </div>

      {(detailLoading || detailPanel) && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => !detailLoading && setSelectedText(null)}>
          <div className="absolute inset-x-0 bottom-0 top-10" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="h-full bg-white dark:bg-gray-800 rounded-t-xl p-5 text-sm text-gray-500 dark:text-gray-400">
                正在加载文章详情...
              </div>
            ) : (
              detailPanel
            )}
          </div>
        </div>
      )}
    </div>
  );
}
