import React, { useState, useEffect, useCallback } from 'react';
import { Howl } from 'howler';
import api from '../api';

import { STRANGENESS, STRANGENESS_LEVELS } from '../constants/strangeness';

export default function VocabDetailPopup({ token, wordId, lemma, onClose, onStrangenessChange }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOOV, setIsOOV] = useState(false);
  const [originalStrangeness, setOriginalStrangeness] = useState(null); // 原始值（从后端获取）
  const [currentStrangeness, setCurrentStrangeness] = useState(null);   // 当前显示值（可能未提交）
  const [dirty, setDirty] = useState(false); // 是否有未提交的修改
  const [showSuccess, setShowSuccess] = useState(false);
  // OOV单词添加表单
  const [oovForm, setOovForm] = useState({ translation: '', phonetic: '', pos: '', all_pos: [] });
  const [saving, setSaving] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  const fetchDetail = useCallback(async () => {
    const lookupId = wordId || lemma || token?.text;
    if (!lookupId) {
      setIsOOV(true);
      setCurrentStrangeness(token?.strangeness || null);
      setLoading(false);
      return;
    }

    if (wordId) {
      setLoading(true);
      setError(null);
      setIsOOV(false);
      try {
        const data = await api.get(`/dictionary/${lookupId}`);
        const result = data?.data || data;
        if (result && result.word_id) {
          setDetail(result);
          setIsOOV(false);
        } else {
          setDetail(null);
          setIsOOV(true);
        }
      } catch (err) {
        setDetail(null);
        setIsOOV(true);
      } finally {
        setCurrentStrangeness(token?.strangeness || null);
        setOriginalStrangeness(token?.strangeness || null);
        setLoading(false);
      }
    } else {
      setDetail(null);
      setIsOOV(true);
      setCurrentStrangeness(token?.strangeness || null);
      setOriginalStrangeness(token?.strangeness || null);
      setLoading(false);
    }
  }, [wordId, lemma, token]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const playAudio = useCallback((phonetic) => {
    if (!phonetic) return;
    const sound = new Howl({
      src: [`/api/audio/en-us/${phonetic[0]}/${lemma || wordId}.mp3`],
      html5: true,
      onloaderror: () => {
        // 静默处理音频加载失败
      }
    });
    sound.play();
  }, [lemma, wordId]);

  const handleStrangenessChange = useCallback(async (direction) => {
    if (!wordId) return;
    try {
      const result = await api.put(`/vocab/${wordId}/strangeness`, { direction, current_strangeness: currentStrangeness });
      if (result?.data?.newStrangeness !== undefined) {
        setCurrentStrangeness(result.data.newStrangeness);
      } else if (currentStrangeness !== null) {
        if (direction === 'down') {
          setCurrentStrangeness(Math.max(1, currentStrangeness - 1));
        } else if (direction === 'up') {
          setCurrentStrangeness(Math.min(7, currentStrangeness + 1));
        }
      }
      setShowSuccess(true);
      onStrangenessChange && onStrangenessChange(result);
    } catch (err) {
      // 错误已在拦截器处理
    }
  }, [wordId, onStrangenessChange, currentStrangeness]);

  // 添加OOV单词到用户词典
  const handleAddToDictionary = async () => {
    if (!token.text) return;
    setSaving(true);
    try {
      await api.post('/dictionary', {
        lemma: token.text.toLowerCase(),
        pos: oovForm.pos || null,
        translation: oovForm.translation,
        definition_en: oovForm.definition_en || null,
        phonetic_us: oovForm.phonetic || null,
        standard_level: 5,
      });
      // 刷新页面数据
      onStrangenessChange && onStrangenessChange();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 从 Free Dictionary API 获取英文释义和音标
  // 从有道获取中文释义
  const handleAutoFill = async () => {
    setLoading(true);
    setError(null);
    setAutoFilled(false);
    try {
      // 并行请求两个 API
      const [enResult, zhResult] = await Promise.all([
        api.post('/dictionary/auto-add', { word: token.text, auto_fill: true }),
        api.get(`/dictionary/youdao?word=${encodeURIComponent(token.text)}`),
      ]);

      const enData = enResult?.data || {};
      const zhData = zhResult?.data || {};

      // 合并结果：中文释义来自有道，英文释义+音标来自 Free Dictionary
      setOovForm({
        translation: zhData.translation || '',
        definition_en: (enData.definition_en || enData.translation || '').substring(0, 300),
        phonetic: zhData.phonetic_us || zhData.phonetic_uk || enData.phonetic || '',
        pos: enData.pos || '',
        all_pos: enData.all_pos || [],
      });
      setAutoFilled(true);
    } catch (err) {
      setError('自动填充失败，请手动输入或检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  // 在线词典搜索链接
  const searchWord = token.text || lemma || wordId;
  const onlineDicts = [
    { name: 'Youdao', url: `https://www.youdao.com/result?word=${encodeURIComponent(searchWord)}&lang=en` },
    { name: 'Cambridge', url: `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(searchWord)}` },
    { name: 'Merriam-Webster', url: `https://www.merriam-webster.com/dictionary/${encodeURIComponent(searchWord)}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">{token.text}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ✕
            </button>
          </div>

          {/* 调整成功后的简化显示 */}
          {showSuccess && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">✓</div>
              <h2 className="text-2xl font-bold mb-2">{token.text}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {detail ? '陌生度调整成功' : '添加到词典成功'}
              </p>
              {currentStrangeness !== null && (
                <p className="text-lg">
                  当前陌生度: <strong className="text-blue-600 dark:text-blue-400">{currentStrangeness}</strong>
                </p>
              )}
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                关闭
              </button>
            </div>
          )}

          {!showSuccess && loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          )}

          {!showSuccess && error && (
            <div className="text-red-500 text-center py-4">{error}</div>
          )}

          {/* OOV单词添加界面 */}
          {!showSuccess && isOOV && !loading && (
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm mb-3">
                  ⚠️ 当前单词不在词典中。你可以手动添加。
                </p>

                {/* 在线词典链接 */}
                <div className="mb-4">
                  <label className="text-sm text-gray-500 dark:text-gray-400 block mb-2">在线查询（点击打开）</label>
                  <div className="flex flex-wrap gap-2">
                    {onlineDicts.map((dict) => (
                      <a
                        key={dict.name}
                        href={dict.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                      >
                        {dict.name} →
                      </a>
                    ))}
                  </div>
                </div>

                {/* 添加表单 */}
                <div className="space-y-3">
                  <button
                    onClick={handleAutoFill}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        获取中...
                      </>
                    ) : (
                      <>{autoFilled ? '🔄 重新获取' : '🔮 自动从词典获取并填充'}</>
                    )}
                  </button>

                  {autoFilled && oovForm.definition_en && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-blue-600 dark:text-blue-400 font-medium">英文释义</span>
                        {oovForm.phonetic && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{oovForm.phonetic}</span>
                        )}
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">{oovForm.definition_en}</p>
                    </div>
                  )}

                  <div className="text-center text-xs text-gray-500 dark:text-gray-400">确认或修改以下信息后点击添加</div>

                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">中文释义 *</label>
                    <input
                      type="text"
                      value={oovForm.translation}
                      onChange={(e) => setOovForm({ ...oovForm, translation: e.target.value })}
                      placeholder="输入中文释义（自动从有道获取）"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">英文释义（可选）</label>
                    <textarea
                      value={oovForm.definition_en || ''}
                      onChange={(e) => setOovForm({ ...oovForm, definition_en: e.target.value })}
                      placeholder="英文释义（自动从词典API获取）"
                      rows={2}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">音标（可选）</label>
                      <input
                        type="text"
                        value={oovForm.phonetic}
                        onChange={(e) => setOovForm({ ...oovForm, phonetic: e.target.value })}
                        placeholder="如: /weɪk/"
                        className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">词性</label>
                      <select
                        value={oovForm.pos}
                        onChange={(e) => setOovForm({ ...oovForm, pos: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">选择词性</option>
                        <option value="n.">名词 (n.)</option>
                        <option value="v.">动词 (v.)</option>
                        <option value="adj.">形容词 (adj.)</option>
                        <option value="adv.">副词 (adv.)</option>
                        <option value="prep.">介词 (prep.)</option>
                        <option value="conj.">连词 (conj.)</option>
                        <option value="pron.">代词 (pron.)</option>
                        <option value="num.">数词 (num.)</option>
                        <option value="det.">限定词 (det.)</option>
                        <option value="phr.">短语 (phr.)</option>
                      </select>
                      {/* Quick POS toggle buttons from API detection */}
                      {oovForm.all_pos && oovForm.all_pos.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="text-xs text-gray-400">检测到: </span>
                          {oovForm.all_pos.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                const posMap = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', conjunction: 'conj.', pronoun: 'pron.', determiner: 'det.' };
                                setOovForm({ ...oovForm, pos: posMap[p] || p });
                              }}
                              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                                oovForm.pos === (p || '')
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleAddToDictionary}
                    disabled={!oovForm.translation.trim() || saving}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? '保存中...' : '✓ 添加到词典'}
                  </button>
                </div>
              </div>

              {/* 陌生度操作（即使OOV也允许标记） */}
              {currentStrangeness !== null && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    当前陌生度: <strong>{currentStrangeness}</strong>
                  </span>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={() => handleStrangenessChange('down')}
                      disabled={currentStrangeness <= 1}
                      className="px-3 py-1 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      降低陌生度 ↓
                    </button>
                    <button
                      onClick={() => handleStrangenessChange('keep')}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                    >
                      保持不变
                    </button>
                    <button
                      onClick={() => handleStrangenessChange('up')}
                      disabled={currentStrangeness >= 7}
                      className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      提高陌生度 ↑
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 词典中存在的单词 */}
          {!showSuccess && detail && !loading && (
            <div className="space-y-4">
              {/* 音标和发音 */}
              {(detail.phonetic_us || detail.phonetic_uk) && (
                <div className="flex items-center gap-4">
                  {detail.phonetic_us && (
                    <button
                      onClick={() => playAudio(detail.phonetic_us)}
                      className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      🔊 美 [{detail.phonetic_us}]
                    </button>
                  )}
                  {detail.phonetic_uk && (
                    <button
                      onClick={() => playAudio(detail.phonetic_uk)}
                      className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      🔊 英 [{detail.phonetic_uk}]
                    </button>
                  )}
                </div>
              )}

              {/* 释义 */}
              {(detail.translation || detail.definition_en) && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">释义</label>
                  {detail.definition_en && (
                    <p className="mt-1 text-sm">{detail.definition_en}</p>
                  )}
                  {detail.translation && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail.translation}</p>
                  )}
                </div>
              )}

              {/* 词性 */}
              {detail.pos && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">词性</label>
                  <p className="mt-1">{detail.pos}</p>
                </div>
              )}

              {/* 难度级别 */}
              {detail.standard_level !== null && detail.standard_level !== undefined && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">难度级别</label>
                  <p className="mt-1">
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                      L{detail.standard_level}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {detail.standard_level <= 2 ? '基础词汇' : detail.standard_level <= 5 ? '中等词汇' : detail.standard_level <= 7 ? '进阶词汇' : '生僻词汇'}
                    </span>
                  </p>
                </div>
              )}

              {/* 搭配 */}
              {detail.collocations && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">常见搭配</label>
                  <p className="mt-1 text-sm">
                    {Array.isArray(detail.collocations)
                      ? detail.collocations.join(', ')
                      : detail.collocations}
                  </p>
                </div>
              )}

              {/* 例句 */}
              {detail.example_sentences && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">例句</label>
                  <ul className="mt-1 space-y-1 text-sm">
                    {Array.isArray(detail.example_sentences)
                      ? detail.example_sentences.map((s, i) => <li key={i}>• {s}</li>)
                      : <li>• {detail.example_sentences}</li>}
                  </ul>
                </div>
              )}

              {/* 近义词 */}
              {detail.synonyms && detail.synonyms.length > 0 && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">近义词</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.synonyms.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded">
                        {s.lemma}{s.pos ? ` (${s.pos})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 反义词 */}
              {detail.antonyms && detail.antonyms.length > 0 && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">反义词</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.antonyms.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded">
                        {a.lemma}{a.pos ? ` (${a.pos})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 陌生度操作 */}
              {currentStrangeness !== null && !showSuccess && (() => {
                const colors = {
                  gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                  cyan: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300',
                  amber: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
                  rose: 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300',
                };
                const cfg = STRANGENESS[currentStrangeness];
                const colorClass = colors[cfg?.color] || colors.gray;
                return (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">当前陌生度:</span>
                      <span className={`px-2 py-0.5 text-sm rounded ${colorClass}`}>
                        {cfg?.label || currentStrangeness}
                      </span>
                      {dirty && <span className="text-xs text-orange-500">(未提交)</span>}
                    </div>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          const newVal = Math.max(1, currentStrangeness - 2);
                          setCurrentStrangeness(newVal);
                          setDirty(true);
                        }}
                        disabled={currentStrangeness <= 1}
                        className="flex-1 px-3 py-2 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        降低 ↓
                      </button>
                      <button
                        onClick={() => {
                          setCurrentStrangeness(originalStrangeness);
                          setDirty(true);
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                      >
                        复原
                      </button>
                      <button
                        onClick={() => {
                          const newVal = Math.min(7, currentStrangeness + 2);
                          setCurrentStrangeness(newVal);
                          setDirty(true);
                        }}
                        disabled={currentStrangeness >= 7}
                        className="flex-1 px-3 py-2 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        提高 ↑
                      </button>
                    </div>
                    {dirty && (
                      <button
                        onClick={async () => {
                          if (!wordId) return;
                          try {
                            const result = await api.put(`/vocab/${wordId}/strangeness`, {
                              direction: currentStrangeness > originalStrangeness ? 'up' : currentStrangeness < originalStrangeness ? 'down' : 'keep',
                              current_strangeness: originalStrangeness,
                            });
                            if (result?.data?.newStrangeness !== undefined) {
                              setCurrentStrangeness(result.data.newStrangeness);
                              setOriginalStrangeness(result.data.newStrangeness);
                            }
                            setDirty(false);
                            setShowSuccess(true);
                            onStrangenessChange && onStrangenessChange(result);
                          } catch (err) {
                            // 错误已在拦截器处理
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                      >
                        提交修改
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
