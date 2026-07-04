# 词典数据库导入完成报告

> 执行时间：2026-06-23
> 总耗时：146.5 秒

## 最终统计

| 指标 | 数量 | 百分比 |
|------|------|--------|
| 总词条数 | 776,853 | 100% |
| 有中文释义 | 768,705 | 99.0% |
| 有音标 | 244,190 | 31.4% |
| 有 senses | 23,921 | 3.1% |
| 有词形变化 | 96,290 | 12.4% |
| lemma 映射 | 101,909 | - |
| 近义词关系 | 17,021 | - |
| COCA 60000 覆盖 | 58,808/58,808 | 100% |

## 数据来源分布

| 来源 | sort_order 范围 | 词条数 |
|------|----------------|--------|
| COCA 60000 | 1 - 58,808 | 58,808 |
| ECDICT 牛津词 | 100,000 - 156,763 | 56,764 |
| ECDICT 非牛津词 | 200,000+ | 667,317 |
| Seed 数据 | - | 0 |

## 数据质量说明

### 音标
- 来源：ECDICT（IPA 格式）
- 覆盖率：31.4%（244,190/776,853）
- 原因：ECDICT 中很多词没有音标字段

### senses（多义项）
- 来源：新牛津（中英双解）
- 覆盖率：3.1%（23,921/776,853）
- 原因：只有新牛津有 senses 数据，且只补充了 COCA 词

### 词形变化
- 来源：ECDICT exchange 字段
- 覆盖率：12.4%（96,290/776,853）

## 后续需要补充的工作

1. **音标补充**：用新世纪词典补充剩余词的音标
2. **senses 补充**：用新牛津补充更多词的 senses
3. **例句补充**：从新牛津提取例句
4. **搭配补充**：从 ECDICT 提取搭配信息
5. **专有名词过滤**：ECDICT 非牛津词中包含大量专有名词，可按需过滤

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
- `full_import.js` - 完整导入脚本（本次执行）
- `compare_and_mark.js` - 牛津词典比较和 ECDICT 标记

## 复现方法

如需重新执行导入：
1. 删除 `server/data/dictionary.db*`
2. 运行 `cd server && node scripts/full_import.js`
