import React, { useState } from 'react';
import api from '../api';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('local');
  const [password, setPassword] = useState('lexhue');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post(`/auth/${mode}`, { username, password });
      localStorage.setItem('lexhue_token', result.data.token);
      localStorage.setItem('lexhue_user', JSON.stringify(result.data.user));
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">LexHue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">多用户学习空间</p>
        </div>

        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 mb-5">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${mode === 'login' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${mode === 'register' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
          >
            注册
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          默认本地账号：local / lexhue
        </p>
      </div>
    </div>
  );
}
