import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function DictionaryManager() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | { ... } for edit | 'new' for create
  const [form, setForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState('freq');
  const limit = 30;

  // Debounce search input (300ms)
  const debounceTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset to first page on new search
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  // Page cache: key = `${debouncedSearch}|${levelFilter}|${sort}|${page}`
  const pageCache = useRef(new Map());

  const loadData = useCallback(async () => {
    const cacheKey = `${debouncedSearch}|${levelFilter}|${sort}|${page}`;
    const cached = pageCache.current.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let url = `/dictionary/search?page=${page}&limit=${limit}&sort=${sort}`;
      if (debouncedSearch) url += `&q=${encodeURIComponent(debouncedSearch)}`;
      if (levelFilter) url += `&level=${levelFilter}`;
      const data = await api.get(url);
      const result = data?.data || data || { items: [], total: 0 };
      const items = result.items || [];
      const total = result.total || 0;
      // Cache up to 20 pages
      if (pageCache.current.size >= 20) {
        const firstKey = pageCache.current.keys().next().value;
        pageCache.current.delete(firstKey);
      }
      pageCache.current.set(cacheKey, { items, total });
      setItems(items);
      setTotal(total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, levelFilter, sort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 当路由路径变化时（如点击左侧菜单），重置编辑状态
  useEffect(() => {
    setEditing(null);
    setForm({});
  }, [location.pathname]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
  };

  const startCreate = () => {
    setEditing('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setForm({
      lemma: '', pos: '', translation: '', definition_en: '',
      phonetic_us: '', phonetic_uk: '',
      standard_level: 5, collocations: '', example_sentences: '',
      sort_order: 0
    });
  };

  const startEdit = async (item) => {
    setEditing(item.word_id);
    // 滚动到页面顶部，确保编辑表单可见
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Fetch full detail from GET endpoint (search only returns subset of fields)
    try {
      const data = await api.get(`/dictionary/${item.word_id}`);
      const detail = data?.data || data || item;
      // Convert JSON object fields to strings for form editing
      for (const jsonField of ['collocations', 'example_sentences']) {
        if (detail[jsonField] && typeof detail[jsonField] === 'object') {
          detail[jsonField] = JSON.stringify(detail[jsonField]);
        }
      }
      setForm({ ...detail });
    } catch (e) {
      // Fallback to item from search results
      setForm({ ...item });
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({});
  };

  const handleFormChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.lemma?.trim()) {
      setError('lemma is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Build payload, ensuring JSON fields are strings
      const payload = {
        ...form,
        standard_level: parseInt(form.standard_level, 10) || 5,
        sort_order: form.sort_order ? parseInt(form.sort_order, 10) : 0,
      };
      // Ensure JSON string fields are stringified if they're objects
      for (const jsonField of ['collocations', 'example_sentences']) {
        if (payload[jsonField] && typeof payload[jsonField] === 'object') {
          payload[jsonField] = JSON.stringify(payload[jsonField]);
        }
      }
      if (editing === 'new') {
        await api.post('/dictionary', payload);
      } else {
        await api.put(`/dictionary/${editing}`, payload);
      }
      setEditing(null);
      setForm({});
      pageCache.current.clear();
      loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wordId) => {
    try {
      await api.delete(`/dictionary/${wordId}`);
      setDeleteConfirm(null);
      pageCache.current.clear();
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">词典管理</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            共 {total} 条词条
          </p>
        </div>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
        >
          + 添加词条
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Search & Filter */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索词汇..."
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        />
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="">全部等级</option>
          {[0,1,2,3,4,5,6,7,8,9].map(l => (
            <option key={l} value={l}>L{l}</option>
          ))}
        </select>
        <button type="submit" className="px-4 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
          搜索
        </button>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ml-2">
          <button
            type="button"
            onClick={() => { setSort('freq'); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              sort === 'freq'
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            按词频
          </button>
          <button
            type="button"
            onClick={() => { setSort('alpha'); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              sort === 'alpha'
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            按字母
          </button>
        </div>
      </form>

      {/* Edit/Create Form */}
      {editing && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-lg font-semibold mb-4">
            {editing === 'new' ? '添加词条' : `编辑词条: ${form.lemma || editing}`}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Lemma *</label>
              <input
                type="text"
                value={form.lemma || ''}
                onChange={(e) => handleFormChange('lemma', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">词性 (POS)</label>
              <input
                type="text"
                value={form.pos || ''}
                onChange={(e) => handleFormChange('pos', e.target.value)}
                placeholder="n, v, adj, adv..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">释义</label>
              <input
                type="text"
                value={form.translation || ''}
                onChange={(e) => handleFormChange('translation', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">美式音标</label>
              <input
                type="text"
                value={form.phonetic_us || ''}
                onChange={(e) => handleFormChange('phonetic_us', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">英式音标</label>
              <input
                type="text"
                value={form.phonetic_uk || ''}
                onChange={(e) => handleFormChange('phonetic_uk', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">标准等级 (1-10) *</label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.standard_level || 5}
                onChange={(e) => handleFormChange('standard_level', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Word ID</label>
              <input
                type="text"
                value={form.word_id || ''}
                onChange={(e) => handleFormChange('word_id', e.target.value)}
                placeholder="留空则使用 lemma"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                disabled={editing !== 'new'}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">常见搭配 (逗号分隔)</label>
              <input
                type="text"
                value={form.collocations || ''}
                onChange={(e) => handleFormChange('collocations', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">英文释义 (definition_en)</label>
              <textarea
                value={form.definition_en || ''}
                onChange={(e) => handleFormChange('definition_en', e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">例句 (逗号分隔)</label>
              <textarea
                value={form.example_sentences || ''}
                onChange={(e) => handleFormChange('example_sentences', e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">排序权重 (sort_order)</label>
              <input
                type="number"
                value={form.sort_order || ''}
                onChange={(e) => handleFormChange('sort_order', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          暂无词条
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Word ID</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Lemma</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">POS</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">释义</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">等级</th>
                <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.word_id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="p-3 text-sm font-mono text-gray-500">{item.word_id}</td>
                  <td className="p-3 font-medium">{item.lemma}</td>
                  <td className="p-3 text-sm text-gray-500">{item.pos || '-'}</td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{item.translation || '-'}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                      L{item.standard_level}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(item)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="删除词条"
        message={`确定要删除词条 "${deleteConfirm?.lemma}" (${deleteConfirm?.word_id}) 吗？`}
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={() => handleDelete(deleteConfirm?.word_id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
