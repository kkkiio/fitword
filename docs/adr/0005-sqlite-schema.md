# ADR 0005: SQLite Schema

## 状态

已采纳

## 背景

fitword 需要持久化用户的练习数据。SQLite 已在 ADR 0001 中选定，需要定义具体表结构。

## 决策

### 数据库位置

```
~/.fitword/fitword.db
```

### questions — 题目表

| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PRIMARY KEY | 自增主键 |
| format | TEXT NOT NULL | `"choice"` / `"fill"` |
| knowledge_type | TEXT NOT NULL | `"noun"` / `"verb"` / `"adjective"` / `"logic"` / `"domain"` |
| question_text | TEXT NOT NULL | 题目文本，含 `____` 占位符 |
| candidates | TEXT | 选择题候选词 JSON 数组。填空题 NULL |
| correct_answer | TEXT | 选择题正确答案。填空题 NULL |
| topic_tag | TEXT | 可选话题标签 |
| created_at | TEXT NOT NULL | ISO 8601 |

### answers — 答题记录表

| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PRIMARY KEY | 自增主键 |
| question_id | INTEGER NOT NULL | 外键 → `questions.id` |
| user_answer | TEXT NOT NULL | 用户输入的答案 |
| is_correct | INTEGER NOT NULL | 0 错误 / 1 正确 |
| created_at | TEXT NOT NULL | ISO 8601 |

### scoring_records — 写作评分记录表

| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PRIMARY KEY | 自增主键 |
| original_text | TEXT NOT NULL | 用户提交的原文 |
| total_score | INTEGER NOT NULL | 总分 1-5 |
| accuracy | INTEGER NOT NULL | 准确度 1-5 |
| specificity | INTEGER NOT NULL | 具体度 1-5 |
| naturalness | INTEGER NOT NULL | 自然度 1-5 |
| structure | INTEGER NOT NULL | 结构 1-5 |
| register | INTEGER NOT NULL | 语域 1-5 |
| main_issues | TEXT NOT NULL | 主要问题描述 |
| suggestions | TEXT NOT NULL | 可替换词建议 JSON 数组 |
| rewrite | TEXT NOT NULL | 改写版本 |
| created_at | TEXT NOT NULL | ISO 8601 |

### 查询

**薄弱类型统计：**

```sql
SELECT q.knowledge_type,
       COUNT(*) AS total,
       SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
       ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS accuracy
FROM answers a JOIN questions q ON a.question_id = q.id
GROUP BY q.knowledge_type ORDER BY accuracy ASC;
```

**选择题 vs 填空题正确率：**

```sql
SELECT q.format,
       COUNT(*) AS total,
       ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS accuracy
FROM answers a JOIN questions q ON a.question_id = q.id
GROUP BY q.format;
```

**话题分布：**

```sql
SELECT topic_tag, COUNT(*) AS total
FROM questions WHERE topic_tag IS NOT NULL
GROUP BY topic_tag ORDER BY total DESC;
```

**写作评分概览：**

```sql
SELECT COUNT(*) AS total_records,
       ROUND(AVG(total_score), 1) AS average_total_score,
       ROUND(AVG(accuracy), 1) AS average_accuracy,
       ROUND(AVG(specificity), 1) AS average_specificity,
       ROUND(AVG(naturalness), 1) AS average_naturalness,
       ROUND(AVG(structure), 1) AS average_structure,
       ROUND(AVG(register), 1) AS average_register
FROM scoring_records;
```

## 后续扩展（v0.1 不做）

- conversation_sessions / messages：对话历史（暂由 pi SDK jsonl 管理）
- 词语收藏夹：后续再定义交互和表结构

## 后果

- questions、answers、scoring_records 三表覆盖 v0.1 练习场景
- questions 和 answers 的写入由 `record_answer` 工具在同一事务中完成
- scoring_records 的写入由 `evaluate_writing` 工具完成
- `get_practice_stats` 工具从上述查询中获取 Agent Memory 数据
