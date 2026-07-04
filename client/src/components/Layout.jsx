import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';

const NAV_ITEMS = [
  { path: '/', label: '仪表板', icon: '🏠' },
  { path: '/level-test', label: '水平测评', icon: '📊' },
  { path: '/level-test-admin', label: '测评文章', icon: '🧪', adminOnly: true },
  { path: '/articles', label: '文章列表', icon: '📄' },
  { path: '/articles/new', label: '导入文章', icon: '➕' },
  { path: '/vocab', label: '词汇管理', icon: '📚' },
  { path: '/review', label: '复习列表', icon: '🔄' },
  { path: '/tags', label: '标签管理', icon: '🏷️' },
  { path: '/settings', label: '设置', icon: '⚙️', adminOnly: true },
  { path: '/export', label: '数据导出', icon: '💾' },
  { path: '/dictionary', label: '词典管理', icon: '📖', adminOnly: true },
];

export default function Layout({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lexhue_user') || 'null'); } catch (e) { return null; }
  });
  const location = useLocation();

  useEffect(() => {
    api.get('/config').then((data) => {
      const scheme = data?.data?.color_scheme || 'light';
      setDarkMode(scheme === 'dark');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    api.put('/config', { color_scheme: newMode ? 'dark' : 'light' }).catch(() => {});
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {}).finally(() => {
      localStorage.removeItem('lexhue_token');
      localStorage.removeItem('lexhue_user');
      window.location.href = '/login';
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="切换侧边栏"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">LexHue</h1>
          </div>
          <div className="flex items-center gap-2">
            {user && <span className="text-sm text-gray-600 dark:text-gray-300">{user.display_name || user.username}</span>}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="切换深色模式"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 侧边栏 */}
        <aside className={`${
          sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
        } transition-all duration-300 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0`}>
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.filter(item => !item.adminOnly || user?.role === 'admin').map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
