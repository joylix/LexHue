import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { STRANGENESS } from '../constants/strangeness';

export default function VocabManager() {
  const [vocab, setVocab] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const limit = 30;

  useEffect(() => {
    loadVocab();
  }, [page, filter]);

  const loadVocab = async () => {
    setLoading(true);
    try {
      let url = `/vocab?page=${page}&limit=${limit}`;
      if (filter !== 'all') {
        const levels = { high: '7', medium: '5', low: '3' };
        if (levels[filter]) {
          url += `&min_difficulty=${levels[filter]}`;
        }
      }
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      const data = await api.get(url);
      const result = data?.data || data || { items: [], total: 0 };
      setVocab(Array.isArray(result.items) ? result.items : (Array.isArray(result) ? result : []));
      setTotal(result.total || 0);
    } catch (e) {
      console.error('Failed to load vocab:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (wordId) => {
    if (!confirm('确定要删除这个词汇吗？')) return;
    try {
      await api.delete(`/vocab/${wordId}`);
      loadVocab();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const handleBatchDelete = async () => {
    if (vocab.length === 0) return;
    if (!confirm(`确定要删除当前页面的 ${vocab.length} 个词汇吗？`)) return;
    try {
      await api.post('/vocab/batch-delete', { word_ids: vocab.map(v => v.word_id) });
      loadVocab();
    } catch (e) {
      alert('批量删除失败: ' + e.message);
    }
  };

  const getStrangenessLabel = (level) => {
    return STRANGENESS[level]?.label || level;
  };

  const getStrangenessColor = (level) => {
    const colors = {
      1: 'bg-gray-100 dark:bg-gray-700',
      3: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      5: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      7: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    };
    return colors[level] || '';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">词汇管理</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">共 {total} 条</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all', label: '全部' },
            { key: 'high', label: '高陌生度' },
            { key: 'medium', label: '中陌生度' },
            { key: 'low', label: '低陌生度' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === f.key
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索词汇..."
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-48"
        />

        {vocab.length > 0 && (
          <button
            onClick={handleBatchDelete}
            className="ml-auto px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
          >
            批量删除
          </button>
        )}
      </div>

      {/* Vocab list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : vocab.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>暂无词汇记录</p>
          <p className="text-sm mt-1">导入文章后，点击生词即可添加到词汇库</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">词汇</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">释义</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">陌生度</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">来源</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">最后复习</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {vocab.map(item => (
                <tr key={item.word_id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="p-3">
                    <Link to={`/vocab/${item.word_id}`} className="font-medium hover:text-blue-600 dark:hover:text-blue-400">
                      {item.lemma || item.word_id}
                    </Link>
                    {item.pos && <span className="text-xs text-gray-400 ml-2">{item.pos}</span>}
                  </td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {item.translation || '-'}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${getStrangenessColor(item.custom_strangeness)}`}>
                      {item.custom_strangeness} - {getStrangenessLabel(item.custom_strangeness)}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-500 dark:text-gray-400">
                    {item.source_type === 'manual' ? '手动' : '自动'}
                  </td>
                  <td className="p-3 text-sm text-gray-500 dark:text-gray-400">
                    {item.last_reviewed_at ? new Date(item.last_reviewed_at).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDelete(item.word_id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            上一页
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
