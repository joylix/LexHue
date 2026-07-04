import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

export default function VocabDetail() {
  const { wordId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDetail();
  }, [wordId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/vocab/${wordId}`);
      const result = data?.data || data;
      setDetail(result);
      setHistory(result.history || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStrangenessChange = async (direction) => {
    try {
      await api.put(`/vocab/${wordId}/strangeness`, { direction });
      loadDetail();
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这个词汇吗？')) return;
    try {
      await api.delete(`/vocab/${wordId}`);
      navigate('/vocab');
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

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
        <button onClick={() => navigate('/vocab')} className="text-blue-600 hover:underline">
          返回词汇列表
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={() => navigate('/vocab')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 返回词汇列表
      </button>

      {/* Word detail card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{detail?.lemma || detail?.word_id}</h1>
            {detail?.pos && <span className="text-sm text-gray-500 dark:text-gray-400">{detail.pos}</span>}
          </div>
          <button
            onClick={handleDelete}
            className="px-3 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
          >
            删除
          </button>
        </div>

        {/* Phonetics */}
        {(detail?.phonetic_us || detail?.phonetic_uk) && (
          <div className="flex gap-4 mb-4">
            {detail?.phonetic_us && <span className="text-sm">美 [{detail.phonetic_us}]</span>}
            {detail?.phonetic_uk && <span className="text-sm">英 [{detail.phonetic_uk}]</span>}
          </div>
        )}

        {/* 释义 */}
        {(detail?.translation || detail?.definition_en) && (
          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-gray-400">释义</label>
            {detail?.translation && <p className="mt-1">{detail.translation}</p>}
            {detail?.definition_en && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail.definition_en}</p>}
          </div>
        )}

        {/* 单词难度（基于 COCA 词频，所有用户共享） */}
        {detail?.standard_level !== null && detail?.standard_level !== undefined && (
          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-gray-400">单词难度</label>
            <p className="mt-1">
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                Level {detail.standard_level}
              </span>
              <span className="text-xs text-gray-400 ml-2">
                {detail?.standard_level <= 2 ? '基础词汇' : detail?.standard_level <= 5 ? '中等词汇' : detail?.standard_level <= 7 ? '进阶词汇' : '生僻词汇'}
              </span>
            </p>
          </div>
        )}

        {/* 近义词 */}
        {detail?.synonyms && detail.synonyms.length > 0 && (
          <div className="mb-4">
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
        {detail?.antonyms && detail.antonyms.length > 0 && (
          <div className="mb-4">
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

        {/* Collocations */}
        {detail?.collocations && (
          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-gray-400">常见搭配</label>
            <p className="mt-1 text-sm">
              {Array.isArray(detail.collocations) ? detail.collocations.join(', ') : detail.collocations}
            </p>
          </div>
        )}

        {/* Example sentences */}
        {detail?.example_sentences && (
          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-gray-400">例句</label>
            <ul className="mt-1 space-y-1 text-sm">
              {Array.isArray(detail.example_sentences)
                ? detail.example_sentences.map((s, i) => <li key={i}>• {s}</li>)
                : <li>• {detail.example_sentences}</li>}
            </ul>
          </div>
        )}

        {/* 陌生度控制（用户个人感受，与单词难度无关） */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            当前陌生度: <strong>{detail?.custom_strangeness}</strong>
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => handleStrangenessChange('down')}
              disabled={detail?.custom_strangeness <= 1}
              className="px-3 py-1 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              降低陌生度 ↓
            </button>
            <button
              onClick={() => handleStrangenessChange('up')}
              disabled={detail?.custom_strangeness >= 7}
              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              提高陌生度 ↑
            </button>
          </div>
        </div>
      </div>

      {/* Modification history */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-3">修改历史</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">暂无修改记录</p>
        ) : (
          <div className="space-y-2">
            {history.map(log => (
              <div key={log.log_id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-gray-500 dark:text-gray-400">
                  {new Date(log.timestamp).toLocaleString('zh-CN')}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                  {log.action_type}
                </span>
                {log.old_strangeness !== null && log.new_strangeness !== null && (
                  <span>
                    {log.old_strangeness} → {log.new_strangeness}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
