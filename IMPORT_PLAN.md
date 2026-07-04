# LexHue 词典数据库导入方案

> 编制日期：2026-06-23
> 目标：从零开始构建完整的词典数据库

## 一、数据源

| 数据源 | 文件 | 词条数 | 用途 |
|--------|------|--------|------|
| COCA 60000 | `word frequency list 60000 English.csv` | 60,000 | 主词表 + 词频排序 |
| 新牛津英汉双解大词典 | `新牛津英汉双解大词典.json` | 130,082 | 详细数据（中英双解、例句） |
| 简明牛津英语词典第11版 | `简明牛津英语词典第11版.json` | 173,728 | 补充收录标记 |
| ECDICT | `ecdict.csv` | 770,430 | 详细数据（音标、词形变化） |
| 金山词霸2006 | `金山词霸2006美国传统词典双解.json` | 92,043 | 音标（编码损坏，不使用） |
| 新世纪英汉大词典 | `新世纪英汉大词典.json` | 219,803 | 兜底补充 |
| ECDICT lemma | `lemma.en.txt` | 186,523 | 词形还原映射 |
| ECDICT resemble | `resemble.txt` | 8,741 | 近义词辨析 |

## 二、数据库字段

```sql
CREATE TABLE dictionary (
    word_id TEXT PRIMARY KEY,           -- 单词（小写）
    lemma TEXT NOT NULL,                -- 原型
    pos TEXT,                           -- 词性
    sw TEXT,                            -- strip-word（去连字符空格，用于模糊匹配）
    translation TEXT,                   -- 中文释义
    definition_en TEXT,                 -- 英文释义
    phonetic_us TEXT,                   -- 美式音标
    phonetic_uk TEXT,                   -- 英式音标
    static_frequency INTEGER DEFAULT 0, -- COCA/BNC/FRQ 词频值
    standard_level INTEGER NOT NULL,    -- 难度等级 0-9
    sort_order INTEGER,                 -- 排序权重
    collocations TEXT DEFAULT '[]',     -- 搭配
    example_sentences TEXT DEFAULT '[]',-- 例句
    senses TEXT,                        -- 多义项 JSON
    exchange TEXT,                      -- 词形变化
    extra TEXT,                         -- 扩展信息 JSON
    source TEXT                         -- 数据来源标记
);
```

## 三、导入顺序

### 阶段 1：标记数据源
1. 比较新牛津和简明牛津，计算并集
2. 扫描 ECDICT，标记每个词是否在牛津并集中
3. 输出 `ecdict_marked.csv`

### 阶段 2：导入词表（占位）
1. **COCA 60000**（除去带括号的词）
   - 写入：word_id, lemma, pos, sw, static_frequency, standard_level, sort_order, source='coca'
   - 排序：按 COCA rank 升序
   
2. **ECDICT 牛津词**（在牛津并集中，且不在 COCA 中）
   - 写入：word_id, lemma, pos, sw, static_frequency, standard_level, sort_order, source='ecdict_oxford'
   - 排序：按 bnc/frq 升序
   
3. **ECDICT 非牛津词**（不在牛津并集中，且不在 COCA 中）
   - 写入：word_id, lemma, pos, sw, static_frequency, standard_level, sort_order, source='ecdict_other'
   - 排序：按 bnc/frq 升序

### 阶段 3：补充详细信息
对每个词，按优先级补充：
- **translation**：ECDICT > 新牛津 > 新世纪
- **definition_en**：新牛津 > ECDICT
- **phonetic_us/uk**：ECDICT > 新世纪
- **senses**：新牛津（中英双解）> ECDICT
- **exchange**：ECDICT
- **collocations**：ECDICT（后续补充）
- **example_sentences**：新牛津

### 阶段 4：导入辅助数据
1. lemma.en.txt → lemma_map
2. resemble.txt → word_relation

## 四、sort_order 计算规则

```
COCA 60000 词：sort_order = COCA rank (1, 2, 3, ...)
ECDICT 牛津词：sort_order = 100000 + bnc/frq rank
ECDICT 非牛津词：sort_order = 200000 + bnc/frq rank
```

## 五、数据质量优先级

### 音标
1. ECDICT（IPA 格式，质量最好）
2. 新世纪（IPA 格式）
3. 金山词霸（编码损坏，不使用）

### 释义
1. 新牛津（中英双解，权威）
2. ECDICT（详细）
3. 新世纪（兜底）

### 词形变化
1. ECDICT（exchange 字段）
