import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ExportImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleExportJson = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/export/json', {
        headers: { Authorization: `Bearer ${localStorage.getItem('lexhue_token') || ''}` },
      });
      if (!response.ok) throw new Error((await response.json()).error?.message || '导出失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LexHue_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('导出失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/export/csv', {
        headers: { Authorization: `Bearer ${localStorage.getItem('lexhue_token') || ''}` },
      });
      if (!response.ok) throw new Error((await response.json()).error?.message || '导出失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LexHue_vocab_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('导出失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/import/json', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('lexhue_token') || ''}` },
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        setImportResult('导入成功！');
      } else {
        setError(result.error?.message || '导入失败');
      }
    } catch (e) {
      setError('导入失败: ' + e.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">数据导出与恢复</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg">
          {error}
        </div>
      )}

      {importResult && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg">
          {importResult}
        </div>
      )}

      {/* Export section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4">导出数据</h2>
        <div className="space-y-3">
          <button
            onClick={handleExportJson}
            disabled={loading}
            className="w-full flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <div>
              <div className="font-medium">导出 JSON</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">导出当前账号数据为 JSON 文件</div>
            </div>
            <span className="text-xl">📄</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={loading}
            className="w-full flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <div>
              <div className="font-medium">导出词汇 CSV</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">导出词汇表为 CSV 文件</div>
            </div>
            <span className="text-xl">📊</span>
          </button>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-500 dark:text-gray-400">
            PostgreSQL 版本请使用 JSON 导出作为账号数据备份。
          </div>
        </div>
      </div>

      {/* Import section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4">恢复数据</h2>
        <div className="space-y-3">
          <label className="block">
            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
              <div className="text-2xl mb-2">📁</div>
              <div className="font-medium">
                {importing ? '导入中...' : '选择 JSON 文件导入'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                导入会覆盖当前账号数据
              </div>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">提示</p>
        <ul className="space-y-1 text-xs">
          <li>• 导出 JSON 包含当前账号数据（配置、词汇、文章、批注等）</li>
          <li>• 导入将覆盖当前账号现有数据</li>
          <li>• 其他账号数据不会被导入覆盖</li>
          <li>• 共享词典数据不会被导出或覆盖</li>
        </ul>
      </div>
    </div>
  );
}
