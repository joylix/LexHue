import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function Home() {
  const [stats, setStats] = useState({
    articles: 0, vocab: 0, reviewDue: 0,
    userLevel: 4, onboardingCompleted: false,
    masteredAtLevel: 0, dictWordsAtLevel: 0, masteryPercent: 0,
    canUpgrade: false, nextLevel: null, upgradeThreshold: 0,
  });
  const [recentArticles, setRecentArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgradeMsg, setUpgradeMsg] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [articlesRes, vocabRes, configRes, statsRes] = await Promise.all([
        api.get('/articles?sort=last_study_time&order=desc&limit=5'),
        api.get('/vocab?limit=1'),
        api.get('/config'),
        api.get('/vocab/stats').catch(() => null),
      ]);

      const articles = articlesRes?.data || articlesRes || [];
      const vocabData = vocabRes?.data || vocabRes || [];
      const config = configRes?.data || configRes || {};
      const statsData = statsRes?.data || {};

      setStats({
        articles: Array.isArray(articles) ? articles.length : 0,
        vocab: Array.isArray(vocabData) ? vocabData.length : 0,
        reviewDue: Array.isArray(vocabData) ? vocabData.filter(v => v.custom_strangeness >= 5).length : 0,
        userLevel: parseInt(config.user_level || '4', 10),
        onboardingCompleted: config.onboarding_completed === 'true',
        masteredAtLevel: statsData.masteredAtLevel || 0,
        dictWordsAtLevel: statsData.dictWordsAtLevel || 0,
        masteryPercent: statsData.masteryPercent || 0,
        canUpgrade: statsData.canUpgrade || false,
        nextLevel: statsData.nextLevel,
        upgradeThreshold: statsData.upgradeThreshold || 0,
      });
      setRecentArticles(Array.isArray(articles) ? articles.slice(0, 5) : []);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      const result = await api.post('/vocab/upgrade-level');
      const data = result?.data || result;
      setUpgradeMsg(`恭喜！等级已从 Level ${data.oldLevel} 提升到 Level ${data.newLevel}！`);
      loadData();
      setTimeout(() => setUpgradeMsg(null), 5000);
    } catch (e) {
      setUpgradeMsg('升级失败: ' + e.message);
      setTimeout(() => setUpgradeMsg(null), 3000);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">仪表板</h1>
        <p className="text-gray-500 dark:text-gray-400">欢迎使用 LexHue 英语生词标引系统</p>
      </div>

      {/* 升级提示 */}
      {upgradeMsg && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
          {upgradeMsg}
        </div>
      )}

      {/* 等级卡片 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-sm p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80">当前英语等级</div>
            <div className="text-4xl font-bold mt-1">Level {stats.userLevel}</div>
            {!stats.onboardingCompleted && (
              <div className="text-sm mt-2 opacity-90">
                ⚠️ 尚未完成水平测评，当前为默认等级
              </div>
            )}
          </div>
          <div className="text-right">
            {stats.onboardingCompleted ? (
              <div>
                <div className="text-sm opacity-80">已掌握词汇</div>
                <div className="text-2xl font-bold">{stats.masteredAtLevel}/{stats.dictWordsAtLevel}</div>
                <div className="text-sm opacity-80">({stats.masteryPercent}%)</div>
              </div>
            ) : (
              <Link
                to="/level-test"
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
              >
                开始测评 →
              </Link>
            )}
          </div>
        </div>

        {/* 升级进度条 */}
        {stats.onboardingCompleted && stats.dictWordsAtLevel > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs opacity-80 mb-1">
              <span>升级进度</span>
              <span>{stats.masteredAtLevel}/{stats.upgradeThreshold} 词可升级</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all"
                style={{ width: `${Math.min(100, stats.masteryPercent)}%` }}
              />
            </div>
            {stats.canUpgrade && (
              <button
                onClick={handleUpgrade}
                className="mt-3 px-4 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                🎉 升级到 Level {stats.nextLevel}！
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="text-sm text-gray-500 dark:text-gray-400">已导入文章</div>
          <div className="text-3xl font-bold mt-1">{stats.articles}</div>
          <Link to="/articles" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
            查看全部 →
          </Link>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="text-sm text-gray-500 dark:text-gray-400">已记录词汇</div>
          <div className="text-3xl font-bold mt-1">{stats.vocab}</div>
          <Link to="/vocab" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
            管理词汇 →
          </Link>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="text-sm text-gray-500 dark:text-gray-400">待复习词汇</div>
          <div className="text-3xl font-bold mt-1 text-orange-500">{stats.reviewDue}</div>
          <Link to="/review" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
            开始复习 →
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-lg font-semibold mb-3">快速操作</h2>
        <div className="flex flex-wrap gap-3">
          {!stats.onboardingCompleted && (
            <Link to="/level-test" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
              📊 开始水平测评
            </Link>
          )}
          <Link to="/articles/new" className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm">
            ➕ 导入文章
          </Link>
          <Link to="/review" className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm">
            🔄 复习词汇
          </Link>
          <Link to="/dictionary" className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm">
            📖 词典管理
          </Link>
        </div>
      </div>

      {/* Recent Articles */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-lg font-semibold mb-3">最近文章</h2>
        {recentArticles.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            还没有导入文章，<Link to="/articles/new" className="text-blue-600 hover:underline">立即导入</Link>
          </p>
        ) : (
          <div className="space-y-2">
            {recentArticles.map(article => (
              <Link
                key={article.article_id}
                to={`/reading/${article.article_id}`}
                className="block p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="font-medium">{article.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {article.new_word_count} 个生词
                  {article.last_study_time && ` · ${new Date(article.last_study_time).toLocaleDateString('zh-CN')}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
