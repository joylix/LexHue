# 词典数据库导入最终报告

> 执行时间：2026-06-23
> 总耗时：约 191 秒（导入 146s + 补充 45s）

## 最终统计

| 指标 | 数量 | 百分比 |
|------|------|--------|
| 总词条数 | 776,853 | 100% |
| 有 POS | 166,259 | 21.4% |
| 有美音 | 248,879 | 32.0% |
| 有英音 | 17,425 | 2.2% |
| 有 senses | 23,921 | 3.1% |
| 有例句 | 10,622 | 1.4% |
| 有词形变化 | 96,290 | 12.4% |
| 有中文释义 | 768,705 | 99.0% |
| lemma 映射 | 101,909 | - |
| 近义词关系 | 17,021 | - |
| COCA 60000 覆盖 | 58,808/58,808 | 100% |

## 数据来源分布

| 来源 | sort_order 范围 | 词条数 | 占比 |
|------|----------------|--------|------|
| COCA 60000 | 1 - 58,808 | 58,808 | 7.6% |
| ECDICT 牛津词 | 100,000 - 156,763 | 56,764 | 7.3% |
| ECDICT 非牛津词 | 200,000+ | 661,281 | 85.1% |

## 数据质量说明

### POS（词性）
- 覆盖率：21.4%（166,259/776,853）
- 来源优先级：COCA JSON > ECDICT CSV > 新世纪
- 主要问题：ECDICT CSV 的 pos 字段解析失败（返回 0），需要后续修复

### 音标
- 美音覆盖率：32.0%（248,879/776,853）
- 英音覆盖率：2.2%（17,425/776,853）
- 来源优先级：ECDICT > coca-vocab-20000 > 新世纪
- 英音数据主要来自 coca-vocab-20000（17,425 条）

### senses（多义项）
- 覆盖率：3.1%（23,921/776,853）
- 来源：新牛津（中英双解）

### 例句
- 覆盖率：1.4%（10,622/776,853）
- 来源：新牛津

### 词形变化
- 覆盖率：12.4%（96,290/776,853）
- 来源：ECDICT exchange 字段

## 数据库 Schema

```sql
CREATE TABLE dictionary (
    word_id TEXT PRIMARY KEY,
    lemma TEXT NOT NULL,
    pos TEXT,
    sw TEXT,                    -- strip-word，用于模糊匹配
    translation TEXT,
    definition_en TEXT,
    phonetic_us TEXT,
    phonetic_uk TEXT,
    static_frequency INTEGER DEFAULT 0,
    standard_level INTEGER NOT NULL CHECK(standard_level BETWEEN 0 AND 9),
    sort_order INTEGER DEFAULT 0,
    collocations TEXT DEFAULT '[]',
    example_sentences TEXT DEFAULT '[]',
    senses TEXT,
    exchange TEXT,
    extra TEXT,
    source TEXT
);
```

## 导入脚本

所有导入脚本位于 `server/scripts/` 目录下：
- `full_import.js` - 完整导入脚本
- `supplement_all.js` - 综合补充脚本
- `compare_and_mark.js` - 牛津词典比较和 ECDICT 标记

## 复现方法

如需重新执行导入：
1. 删除 `server/data/dictionary.db*`
2. 运行 `cd server && node scripts/full_import.js`
3. 运行 `cd server && node scripts/supplement_all.js`

## 后续待办

1. **修复 ECDICT POS 解析**：ECDICT CSV 的 pos 字段解析失败，需要重新扫描
2. **补充更多 senses**：目前只有新牛津的词有 senses，ECDICT 的词需要从 definition/translation 生成
3. **补充搭配信息**：从 ECDICT 提取搭配
4. **专有名词过滤**：ECDICT 非牛津词中包含大量专有名词，可按需过滤
