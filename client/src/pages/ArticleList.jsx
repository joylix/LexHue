import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function ArticleList() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [showBatchTag, setShowBatchTag] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    loadArticles();
  }, [filter]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const status = filter === 'all' ? '' : filter;
      const data = await api.get(`/articles${status ? `?status=${status}` : ''}`);
      setArticles(data?.data || data || []);
    } catch (e) {
      console.error('Failed to load articles:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === articles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(articles.map(a => a.article_id)));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await api.delete(`/articles/${id}`);
      loadArticles();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const handleBatchTag = async () => {
    if (!tagInput.trim() || selected.size === 0) return;
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    try {
      await api.post('/articles/batch-tag', {
        article_ids: [...selected],
        add_tags: tags,
      });
      setShowBatchTag(false);
      setTagInput('');
      setSelected(new Set());
      loadArticles();
    } catch (e) {
      alert('打标失败: ' + e.message);
    }
  };

  const getArticleTags = (tags) => {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">文章列表</h1>
        <Link to="/articles/new" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
          + 导入文章
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {['all', 'incomplete', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === f
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {f === 'all' ? '全部' : f === 'incomplete' ? '未完成' : '已完成'}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">已选 {selected.size} 篇</span>
            <button
              onClick={() => setShowBatchTag(true)}
              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200"
            >
              批量打标
            </button>
          </div>
        )}
      </div>

      {/* Batch tag dialog */}
      {showBatchTag && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">为 {selected.size} 篇文章添加标签（逗号分隔）</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="标签1, 标签2"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            />
            <button onClick={handleBatchTag} className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              确认
            </button>
            <button onClick={() => setShowBatchTag(false)} className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Article list */}
      {articles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>还没有文章</p>
          <Link to="/articles/new" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            立即导入
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === articles.length && articles.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">标题</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">生词</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">状态</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">最后学习</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map(article => (
                <tr key={article.article_id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(article.article_id)}
                      onChange={() => toggleSelect(article.article_id)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3">
                    <Link to={`/reading/${article.article_id}`} className="font-medium hover:text-blue-600 dark:hover:text-blue-400">
                      {article.title}
                    </Link>
                    {getArticleTags(article.tags).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {getArticleTags(article.tags).slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-sm">{article.new_word_count || 0}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      article.is_completed
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                    }`}>
                      {article.is_completed ? '已完成' : '未完成'}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-500 dark:text-gray-400">
                    {article.last_study_time ? new Date(article.last_study_time).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDelete(article.article_id)}
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
    </div>
  );
}
