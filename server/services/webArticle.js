const dns = require('dns').promises;
const net = require('net');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const config = require('../config');

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'LexHue/1.0 (+local article importer)';
const ENGLISH_STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
]);

function createValidationError(message) {
  const err = new Error(message);
  err.type = 'validation';
  return err;
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw createValidationError('URL 不能为空');
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw createValidationError('URL 格式无效');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw createValidationError('只支持 http 或 https 链接');
  }
  if (!url.hostname) {
    throw createValidationError('URL 缺少主机名');
  }
  return url;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const value = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      value === 0 ||
      value >= 0xe0000000
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return true;
}

async function assertPublicUrl(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw createValidationError('不允许导入本机地址');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw createValidationError('不允许导入内网或本机地址');
    }
    return;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw createValidationError('无法解析该 URL 的主机名');
  }

  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw createValidationError('不允许导入解析到内网或本机地址的链接');
  }
}

function resolveRedirectUrl(currentUrl, location) {
  if (!location) return null;
  return new URL(location, currentUrl);
}

async function readLimitedResponse(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      throw createValidationError('网页内容过大，无法导入');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

async function fetchHtml(url, redirects = 0) {
  await assertPublicUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw createValidationError('网页重定向次数过多');
      }
      const nextUrl = resolveRedirectUrl(url, response.headers.get('location'));
      if (!nextUrl) {
        throw createValidationError('网页重定向地址无效');
      }
      return fetchHtml(nextUrl, redirects + 1);
    }

    if (!response.ok) {
      throw createValidationError(`网页获取失败，HTTP 状态码 ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
      throw createValidationError('该链接返回的不是 HTML 网页');
    }

    return {
      html: await readLimitedResponse(response),
      finalUrl: url.toString(),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw createValidationError('网页获取超时');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractTextFromHtml(html, url) {
  const dom = new JSDOM(html, { url: url.toString() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (article?.textContent) {
    return {
      title: normalizeText(article.title),
      content: normalizeText(article.textContent),
      excerpt: normalizeText(article.excerpt),
    };
  }

  const document = dom.window.document;
  const fallbackText = normalizeText(document.body?.textContent || '');
  return {
    title: normalizeText(document.title),
    content: fallbackText,
    excerpt: '',
  };
}

function analyzeEnglish(text) {
  const words = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
  const visibleChars = text.replace(/\s/g, '').length;
  const englishChars = words.reduce((sum, word) => sum + word.length, 0);
  const lowerWords = words.map((word) => word.toLowerCase());
  const stopWordHits = lowerWords.filter((word) => ENGLISH_STOP_WORDS.has(word)).length;

  return {
    wordCount: words.length,
    englishCharRatio: visibleChars > 0 ? englishChars / visibleChars : 0,
    stopWordRatio: words.length > 0 ? stopWordHits / words.length : 0,
  };
}

function assertEnglishContent(text) {
  const analysis = analyzeEnglish(text);
  if (
    analysis.wordCount < 80 ||
    analysis.englishCharRatio < 0.6 ||
    analysis.stopWordRatio < 0.02
  ) {
    throw createValidationError('未能确认网页主体是英文文章，请改为手动粘贴内容');
  }
  return analysis;
}

function truncateAtBoundary(text, maxChars) {
  if (text.length <= maxChars) {
    return { content: text, truncated: false, originalLength: text.length };
  }

  const slice = text.slice(0, maxChars);
  const boundary = Math.max(
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! ')
  );
  const cutAt = boundary >= Math.floor(maxChars * 0.7) ? boundary + 1 : maxChars;
  return {
    content: slice.slice(0, cutAt).trim(),
    truncated: true,
    originalLength: text.length,
  };
}

async function extractArticleFromUrl(rawUrl) {
  const requestedUrl = normalizeUrl(rawUrl);
  const { html, finalUrl } = await fetchHtml(requestedUrl);
  const extracted = extractTextFromHtml(html, finalUrl);

  if (!extracted.content || extracted.content.length < 300) {
    throw createValidationError('未能从该网页提取到足够的正文内容');
  }

  const englishAnalysis = assertEnglishContent(extracted.content);
  const limited = truncateAtBoundary(extracted.content, config.articleMaxChars);

  return {
    title: extracted.title || 'Untitled',
    content: limited.content,
    sourceUrl: finalUrl,
    excerpt: extracted.excerpt,
    originalLength: limited.originalLength,
    contentLength: limited.content.length,
    truncated: limited.truncated,
    maxChars: config.articleMaxChars,
    english: englishAnalysis,
  };
}

module.exports = {
  extractArticleFromUrl,
  analyzeEnglish,
  truncateAtBoundary,
};
