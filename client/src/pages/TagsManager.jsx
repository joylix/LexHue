import React, { useState, useEffect } from 'react';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function TagsManager() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingPath, setEditingPath] = useState('');
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoading(true);
    try {
      const data = await api.get('/tags');
      setTags(data?.data || data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTag.trim()) return;
    try {
      await api.post('/tags', { tag_path: newTag.trim() });
      setNewTag('');
      loadTags();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRename = async (id) => {
    if (!editingPath.trim()) return;
    try {
      await api.put(`/tags/${id}`, { tag_path: editingPath.trim() });
      setEditingId(null);
      setEditingPath('');
      loadTags();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/tags/${id}`);
      setDeleteConfirm(null);
      loadTags();
    } catch (e) {
      setError(e.message);
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
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">标签管理</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Create new tag */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="输入新标签名称"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            创建
          </button>
        </div>
      </div>

      {/* Tag list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {tags.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            暂无标签
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {tags.map(tag => (
              <div key={tag.tag_id} className="p-4 flex items-center gap-3">
                {editingId === tag.tag_id ? (
                  <>
                    <input
                      type="text"
                      value={editingPath}
                      onChange={(e) => setEditingPath(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(tag.tag_id)}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(tag.tag_id)}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditingPath(''); }}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="font-medium">{tag.tag_path}</span>
                      <span className="text-sm text-gray-400 ml-2">({tag.article_count} 篇文章)</span>
                    </div>
                    <button
                      onClick={() => { setEditingId(tag.tag_id); setEditingPath(tag.tag_path); }}
                      className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(tag)}
                      className="px-3 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="删除标签"
        message={`确定要删除标签 "${deleteConfirm?.tag_path}" 吗？这将从所有文章中移除此标签。`}
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={() => handleDelete(deleteConfirm?.tag_id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
