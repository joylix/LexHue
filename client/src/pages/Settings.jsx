import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Settings() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await api.get('/config');
      setConfig(data?.data || data || {});
    } catch (e) {
      console.error('Failed to load config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/config', config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setSaving(false);
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
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">个人设置</h1>

      {saved && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg">
          设置已保存
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        {/* User Level */}
        <div>
          <label className="block text-sm font-medium mb-1">英语水平等级</label>
          <select
            value={config.user_level || '3'}
            onChange={(e) => handleChange('user_level', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(l => (
              <option key={l} value={String(l)}>Level {l}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            当前评估的英语水平，影响词汇陌生度计算
          </p>
        </div>

        {/* Init Mode */}
        <div>
          <label className="block text-sm font-medium mb-1">初始模式</label>
          <select
            value={config.init_mode || 'strict'}
            onChange={(e) => handleChange('init_mode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="strict">严格模式 (二档)</option>
            <option value="gradient">梯度模式 (四档)</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            严格模式：低于等于等级=已掌握，否则=陌生；梯度模式：按等级差计算
          </p>
        </div>

        {/* OOV Default Strangeness */}
        <div>
          <label className="block text-sm font-medium mb-1">OOV 默认陌生度</label>
          <select
            value={config.oov_default_strangeness || '7'}
            onChange={(e) => handleChange('oov_default_strangeness', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            {[1, 3, 5, 7].map(l => (
              <option key={l} value={String(l)}>{l}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            词典中不存在的词汇的默认陌生度
          </p>
        </div>

        {/* Color Blind Mode */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium">色弱模式</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">使用对色弱友好的配色方案</p>
          </div>
          <button
            onClick={() => handleChange('color_blind_mode', config.color_blind_mode === 'true' ? 'false' : 'true')}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.color_blind_mode === 'true' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                config.color_blind_mode === 'true' ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Color Scheme */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium">深色模式</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">切换深色/浅色主题</p>
          </div>
          <button
            onClick={() => handleChange('color_scheme', config.color_scheme === 'dark' ? 'light' : 'dark')}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.color_scheme === 'dark' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                config.color_scheme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Density Threshold */}
        <div>
          <label className="block text-sm font-medium mb-1">生词密度阈值</label>
          <input
            type="number"
            min="1"
            max="100"
            value={config.density_threshold || '40'}
            onChange={(e) => handleChange('density_threshold', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            生词密度超过此值时提示文章可能过难（百分比）
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存设置'}
      </button>
    </div>
  );
}
