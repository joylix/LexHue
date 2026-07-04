import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const ARTICLE_MAX_CHARS = 10000;
const formatCount = (value) => value.toLocaleString('en-US');

export default function ArticleDetail() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('paste');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceInfo, setSourceInfo] = useState(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Auto-extract title from first line of content
  const extractTitle = (text) => {
    if (!text) return '';
    const firstLine = text.split(/\n/).map(l => l.trim()).find(l => l.length > 0) || '';
    return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  };

  const handleExtractUrl = async () => {
    const url = sourceUrl.trim();
    if (!url) {
      setError('请输入网页链接');
      return;
    }

    setFetchingUrl(true);
    setError(null);
    setSourceInfo(null);

    try {
      const data = await api.post('/articles/extract-url', { url });
      const article = data?.data || data;
      setContent(article.content || '');
      setSourceInfo(article);
    } catch (e) {
      setError(e.message);
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('文章内容不能为空');
      return;
    }
    if (trimmedContent.length > ARTICLE_MAX_CHARS) {
      setError(`文章内容不能超过 ${formatCount(ARTICLE_MAX_CHARS)} 个字符，当前为 ${formatCount(trimmedContent.length)} 个字符`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const title = extractTitle(trimmedContent);
      const data = await api.post('/articles', { title, content: trimmedContent, source_url: sourceInfo?.sourceUrl || null });
      const article = data?.data || data;
      setResult({ ...article, title });

      // Navigate to reading page after short delay
      setTimeout(() => {
        navigate(`/reading/${article.articleId}`);
      }, 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">文章导入成功！</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          《{result.title}》
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          发现 {result.newWordCount || 0} 个生词，正在跳转到阅读页面...
        </p>
      </div>
    );
  }

  const trimmedLength = content.trim().length;
  const isOverLimit = trimmedLength > ARTICLE_MAX_CHARS;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">导入文章</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('paste');
                setError(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                mode === 'paste'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              粘贴文本
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('url');
                setError(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                mode === 'url'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              网页链接
            </button>
          </div>
        </div>

        {mode === 'url' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">网页链接</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setSourceInfo(null);
                  if (error) setError(null);
                }}
                placeholder="https://example.com/article"
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                type="button"
                onClick={handleExtractUrl}
                disabled={fetchingUrl || !sourceUrl.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {fetchingUrl ? '获取中...' : '获取正文'}
              </button>
            </div>
            {sourceInfo && (
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>来源：{sourceInfo.sourceUrl}</p>
                <p>
                  已提取 {formatCount(sourceInfo.contentLength || 0)} 个字符
                  {sourceInfo.truncated ? `，原文约 ${formatCount(sourceInfo.originalLength || 0)} 个字符，已截断到上限内` : ''}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">文章内容</label>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (error && e.target.value.trim().length <= ARTICLE_MAX_CHARS) {
                setError(null);
              }
            }}
            placeholder="粘贴英文文章内容...&#10;&#10;第一行将自动作为文章标题"
            rows={18}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:border-transparent outline-none font-mono text-sm ${
              isOverLimit
                ? 'border-red-400 dark:border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
            }`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1 text-xs">
            <p className="text-gray-400">
              {content.trim() ? `标题预览：${extractTitle(content)}` : `上限：${formatCount(ARTICLE_MAX_CHARS)} 个字符`}
            </p>
            <p className={isOverLimit ? 'text-red-500' : 'text-gray-400'}>
              {formatCount(trimmedLength)} / {formatCount(ARTICLE_MAX_CHARS)}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">标签（可选，逗号分隔）</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例如: 科技, 新闻"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || isOverLimit}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? '导入中...' : '导入文章'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/articles')}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
