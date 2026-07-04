/**
 * 有道词典网页解析服务
 * 通过爬取有道词典网页获取中文释义
 */

const https = require('https');
const http = require('http');

/**
 * 从有道词典获取中文释义
 * @param {string} word - 英文单词
 * @returns {Promise<{translation: string|null, phonetic_us: string|null, phonetic_uk: string|null}>}
 */
async function fetchFromYoudao(word) {
  return new Promise((resolve) => {
    const url = `https://dict.youdao.com/w/${encodeURIComponent(word)}/`;
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeout: 8000,
    }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        httpGet(redirectUrl, resolve);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = parseYoudaoHTML(data, word);
          resolve(result);
        } catch (e) {
          console.error('[Youdao] Parse error:', e.message);
          resolve({ translation: null, phonetic_us: null, phonetic_uk: null });
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('[Youdao] Request error:', e.message);
      resolve({ translation: null, phonetic_us: null, phonetic_uk: null });
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.error('[Youdao] Timeout');
      resolve({ translation: null, phonetic_us: null, phonetic_uk: null });
    });
  });
}

function httpGet(url, resolve) {
  const mod = url.startsWith('https') ? https : http;
  const req = mod.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: 8000,
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = parseYoudaoHTML(data, '');
        resolve(result);
      } catch (e) {
        resolve({ translation: null, phonetic_us: null, phonetic_uk: null });
      }
    });
  });
  req.on('error', () => resolve({ translation: null, phonetic_us: null, phonetic_uk: null }));
  req.on('timeout', () => { req.destroy(); resolve({ translation: null, phonetic_us: null, phonetic_uk: null }); });
}

/**
 * 解析有道词典 HTML，提取中文释义和音标
 */
function parseYoudaoHTML(html, word) {
  let translation = null;
  let phonetic_us = null;
  let phonetic_uk = null;

  // 提取音标
  // 有道页面结构：.phonetic 类包含音标，可能有一个或多个
  const phoneticMatches = html.match(/class="[^"]*phonetic[^"]*"[^>]*>([^<]+)</g);
  if (phoneticMatches) {
    const phonetics = [];
    for (const m of phoneticMatches) {
      const text = m.replace(/class="[^"]*phonetic[^"]*"[^>]*>/, '').trim();
      if (text && text.length < 30) {
        phonetics.push(text.replace(/[<>\s]+$/, ''));
      }
    }
    // 有道通常只显示一个音标，优先当作美式
    if (phonetics.length >= 1) {
      // 检查是否有明确的英美标注
      const usIdx = html.search(/美\s*<[^>]*class="[^"]*phonetic/);
      const ukIdx = html.search(/英\s*<[^>]*class="[^"]*phonetic/);
      if (usIdx >= 0 && ukIdx >= 0 && usIdx !== ukIdx) {
        // 有区分英美
        phonetic_us = phonetics[0];
        phonetic_uk = phonetics[1] || phonetics[0];
      } else {
        // 只有一个音标，同时赋给英美
        phonetic_us = phonetics[0];
        phonetic_uk = phonetics[0];
      }
    }
  }

  // 备用：从文本中提取 [xxx] 格式的音标
  if (!phonetic_us) {
    const bracketMatch = html.match(/\[([əɪɑɔʊɛæʌθðʃʒŋːa-zA-Z\s]+)\]/);
    if (bracketMatch) {
      phonetic_us = bracketMatch[1].trim();
      phonetic_uk = bracketMatch[1].trim();
    }
  }

  // 提取中文释义 - 多种模式
  // 模式1: #phrsListTab .trans-container li 中的中文
  const transContainerMatch = html.match(/id="phrsListTab"[^>]*>.*?<ul[^>]*>(.*?)<\/ul>/s);
  if (transContainerMatch) {
    const liMatches = transContainerMatch[1].match(/<li[^>]*>(.*?)<\/li>/gs);
    if (liMatches) {
      const translations = [];
      for (const li of liMatches) {
        const text = li.replace(/<[^>]+>/g, '').trim();
        // 只保留包含中文的释义
        if (/[\u4e00-\u9fff]/.test(text) && text.length < 100) {
          translations.push(text);
        }
      }
      if (translations.length > 0) {
        translation = translations.slice(0, 5).join('; ');
      }
    }
  }

  // 模式2: .trans-container .wordGroup 中的中文释义
  if (!translation) {
    const wordGroupMatch = html.match(/class="[^"]*wordGroup[^"]*"[^>]*>([\s\S]*?)(?:<\/div>|<\/p>)/);
    if (wordGroupMatch) {
      const text = wordGroupMatch[1].replace(/<[^>]+>/g, '').trim();
      if (/[\u4e00-\u9fff]/.test(text)) {
        translation = text.substring(0, 200);
      }
    }
  }

  // 模式3: 从 JSON-LD 或 script 标签中提取
  if (!translation) {
    const jsonMatch = html.match(/"translation"\s*:\s*"([^"]+)"/);
    if (jsonMatch) {
      translation = jsonMatch[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, code) => 
        String.fromCharCode(parseInt(code, 16))
      );
    }
  }

  // 模式4: 从 #tWebTrans .wt-container 提取网络释义
  if (!translation) {
    const webTransMatch = html.match(/id="tWebTrans"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (webTransMatch) {
      const items = webTransMatch[1].match(/<p[^>]*class="[^"]*wordGroup[^"]*"[^>]*>(.*?)<\/p>/gs);
      if (items) {
        const translations = [];
        for (const item of items.slice(0, 3)) {
          const text = item.replace(/<[^>]+>/g, '').trim();
          if (/[\u4e00-\u9fff]/.test(text) && text.length < 80) {
            translations.push(text);
          }
        }
        if (translations.length > 0) {
          translation = translations.join('; ');
        }
      }
    }
  }

  return { translation, phonetic_us, phonetic_uk };
}

module.exports = {
  fetchFromYoudao,
};
