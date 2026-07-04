import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function ReviewList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadReviewList();
  }, [page]);

  const loadReviewList = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/vocab/review?page=${page}&limit=${limit}`);
      const result = data?.data || data || { items: [], total: 0 };
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      console.error('Failed to load review list:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStrangenessChange = async (wordId, direction) => {
    try {
      await api.put(`/vocab/${wordId}/strangeness`, { direction });
      loadReviewList();
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
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
        <div>
          <h1 className="text-2xl font-bold">复习列表</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            共 {total} 个词汇待复习，按陌生度和最后复习时间排序
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-3">🎉</div>
          <p>太棒了！没有需要复习的词汇</p>
          <Link to="/articles/new" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            导入新文章
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.word_id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/vocab/${item.word_id}`}
                    className="font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {item.lemma || item.word_id}
                  </Link>
                  {item.pos && (
                    <span className="text-xs text-gray-400">{item.pos}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStrangenessColor(item.custom_strangeness)}`}>
                    {item.custom_strangeness}
                  </span>
                </div>
                {item.translation && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {item.translation}
                  </p>
                )}
                {item.last_reviewed_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    上次复习: {new Date(item.last_reviewed_at).toLocaleDateString('zh-CN')}
                  </p>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleStrangenessChange(item.word_id, 'down')}
                  disabled={item.custom_strangeness <= 1}
                  className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  认识 ↓
                </button>
                <button
                  onClick={() => handleStrangenessChange(item.word_id, 'up')}
                  disabled={item.custom_strangeness >= 7}
                  className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  不认识 ↑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
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
