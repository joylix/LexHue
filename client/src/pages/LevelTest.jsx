import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { renderTokens } from '../utils/tokenRenderer';
import VocabDetailPopup from '../components/VocabDetailPopup';
import { STRANGENESS, STRANGENESS_BG, STRANGENESS_FG, STRANGENESS_LEVELS } from '../constants/strangeness';

export default function LevelTest() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [text, setText] = useState(null);
  const [level, setLevel] = useState(null);
  const [asked, setAsked] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [finalLevel, setFinalLevel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 词汇弹窗
  const [selectedToken, setSelectedToken] = useState(null);
  const [showVocabPopup, setShowVocabPopup] = useState(false);

  const wordStats = React.useMemo(() => {
    if (!text?.tokens) return { counts: { 1: 0, 3: 0, 5: 0, 7: 0 }, total: 0, aboveWords: [] };
    const seen = new Map();
    for (const token of text.tokens) {
      if (!token.is_word || !token.word_id) continue;
      if (!seen.has(token.word_id)) {
        seen.set(token.word_id, token);
      }
    }
    const counts = { 1: 0, 3: 0, 5: 0, 7: 0 };
    const aboveWords = [];
    for (const token of seen.values()) {
      const s = token.strangeness || 1;
      if (counts[s] !== undefined) counts[s]++;
      if ((token.standard_level ?? 0) > (level ?? 0) && (s === 5 || s === 7)) {
        aboveWords.push(token);
      }
    }
    aboveWords.sort((a, b) => (b.standard_level ?? 0) - (a.standard_level ?? 0));
    return { counts, total: seen.size, aboveWords };
  }, [text, level]);

  const formatStat = (count) => {
    const percent = wordStats.total > 0 ? Math.round((count / wordStats.total) * 100) : 0;
    return `${count} / ${percent}%`;
  };

  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/level-test/start');
      const result = data?.data || data;
      setSession(result.sessionId);
      setLevel(result.level);
      setText(result.text);
      setAsked(0);
      setCompleted(false);
      setCancelled(false);
      setFinalLevel(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (feedback) => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/level-test/feedback', {
        sessionId: session,
        level,
        feedback,
      });
      const result = data?.data || data;

      if (result.completed) {
        setCompleted(true);
        setCancelled(result.cancelled || false);
        setFinalLevel(result.finalLevel);
        setText(null);
      } else {
        setLevel(result.nextLevel);
        setText(result.text);
        setAsked(result.asked || asked + 1);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 测评完成
  if (completed) {
    if (cancelled) {
      return (
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="text-5xl mb-4">🔄</div>
          <h1 className="text-2xl font-bold mb-2">测评已取消</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            您可以随时重新开始测评。当前默认等级为 <strong>L4</strong>。
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/level-test')}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              重新测评
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">测评完成！</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          根据您的反馈，系统评估您的英语水平为
        </p>
        <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-6">
          L{finalLevel}
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 text-sm text-blue-700 dark:text-blue-300">
          <p>📖 测评文章等级: <strong>L{finalLevel}</strong></p>
          <p className="mt-1">系统将根据您的等级自动标注文章中的词汇难度。</p>
          <p className="mt-1">随着您掌握更多词汇，等级会自动提升。</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/articles/new')}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            开始导入文章
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // 未开始测评
  if (!session) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <h1 className="text-2xl font-bold mb-4">英语水平测评</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          系统会从 <strong>L4</strong> 的文章开始，根据您的反馈自动调整难度。
        </p>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 text-sm text-left">
          <p className="font-medium mb-2">测评说明：</p>
          <ul className="space-y-1 text-gray-600 dark:text-gray-400">
            <li>• 阅读文章后选择"太难"或"太简单"</li>
            <li>• 如果文章难度刚好，选择"确认当前等级"</li>
            <li>• 测评完成后可随时重新测评</li>
          </ul>
        </div>
        <button
          onClick={startTest}
          disabled={loading}
          className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {loading ? '加载中...' : '开始测评'}
        </button>
        {error && <p className="text-red-500 mt-4">{error}</p>}
      </div>
    );
  }

  // 测评进行中
  return (
    <div className="flex gap-6">
      {/* 顶部信息栏 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">水平测评</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              第 {asked + 1} 题
            </span>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
              L{level}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* 文章区域 — 使用与阅读页面相同的颜色标注渲染 */}
        {text && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{text.title}</h2>
              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                L{level}
              </span>
            </div>
            <div
              className="prose dark:prose-invert max-w-none leading-relaxed whitespace-pre-wrap text-base select-text"
              onClick={(e) => {
                // 点击单词弹出详情
                const target = e.target;
                if (target.dataset && target.dataset.wordId) {
                  const token = text.tokens.find(t => t.word_id === target.dataset.wordId && t.start_char <= target.dataset.startChar && t.end_char >= target.dataset.endChar);
                  if (token) {
                    setSelectedToken(token);
                    setShowVocabPopup(true);
                  }
                }
              }}
            >
              {text.tokens && text.tokens.length > 0 ? (
                renderTokens(text.tokens, [], null, new Set())
              ) : (
                text.content
              )}
            </div>
          </div>
        )}

        {text && wordStats.aboveWords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
              本题超纲词（高于 Level {level}）共 {formatStat(wordStats.aboveWords.length)}
            </h3>
            <div className="space-y-3">
              {[7, 5].map(s => {
                const words = wordStats.aboveWords.filter(w => w.strangeness === s);
                if (words.length === 0) return null;
                return (
                  <div key={s}>
                    <div className={`text-xs font-medium mb-1 ${STRANGENESS_FG[s]}`}>
                      {STRANGENESS[s].label}（{formatStat(words.length)}）
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

        {/* 操作按钮 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-center text-gray-600 dark:text-gray-400 mb-4 text-sm">
            这篇文章的难度如何？
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => submitFeedback('hard')} disabled={loading} className="px-5 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50">
              ⬇️ 降低难度
            </button>
            <button onClick={() => submitFeedback('confirm')} disabled={loading} className="px-5 py-2.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors disabled:opacity-50 font-medium">
              ✅ 确认当前等级
            </button>
            <button onClick={() => submitFeedback('easy')} disabled={loading} className="px-5 py-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50">
              ⬆️ 升高难度
            </button>
          </div>
          <div className="flex justify-center gap-3 mt-3">
            <button onClick={() => submitFeedback('skip')} disabled={loading} className="px-4 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              跳过测评 (默认 L4)
            </button>
            <button onClick={() => submitFeedback('cancel')} disabled={loading} className="px-4 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
              取消测评
            </button>
          </div>
        </div>
      </div>

      <div className="w-56 flex-shrink-0 space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p><strong>测评标注说明</strong></p>
          <p>• 当前题目按 Level {level} 计算词汇陌生度</p>
          <p>• 低于当前等级：不标色</p>
          <p>• 等于当前等级：熟识</p>
          <p>• 高于当前等级 1 级：浅知</p>
          <p>• 高于当前等级 2 级及以上：陌生</p>
          <p>• 颜色只辅助判断，请按整体阅读难度反馈</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
          <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">页面词汇统计</h4>
          <div className="space-y-1.5">
            {STRANGENESS_LEVELS.map(s => (
              <div key={s} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-6 h-3 rounded ${STRANGENESS_BG[s]}`} />
                  <span className="text-gray-600 dark:text-gray-400">{STRANGENESS[s].label}</span>
                </div>
                <span className="font-medium">{formatStat(wordStats.counts[s] || 0)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700 dark:text-gray-300">总计</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{formatStat(wordStats.total)}</span>
          </div>
        </div>
      </div>

      {/* Vocab Detail Popup - 只读模式 */}
      {showVocabPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setShowVocabPopup(false); setSelectedToken(null); }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{selectedToken?.text}</h3>
              <button onClick={() => { setShowVocabPopup(false); setSelectedToken(null); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
            </div>
            {selectedToken?.translation && (
              <div className="mb-3">
                <label className="text-sm text-gray-500 dark:text-gray-400">释义</label>
                <p className="mt-1 text-sm">{selectedToken.translation}</p>
              </div>
            )}
            {selectedToken?.definition_en && (
              <div className="mb-3">
                <label className="text-sm text-gray-500 dark:text-gray-400">英文释义</label>
                <p className="mt-1 text-sm">{selectedToken.definition_en}</p>
              </div>
            )}
            {selectedToken?.pos && (
              <div className="mb-3">
                <label className="text-sm text-gray-500 dark:text-gray-400">词性</label>
                <p className="mt-1 text-sm">{selectedToken.pos}</p>
              </div>
            )}
            {selectedToken?.standard_level !== null && selectedToken?.standard_level !== undefined && (
              <div className="mb-3">
                <label className="text-sm text-gray-500 dark:text-gray-400">难度级别</label>
                <p className="mt-1">
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">L{selectedToken.standard_level}</span>
                </p>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400">测评模式下不可修改陌生度</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
