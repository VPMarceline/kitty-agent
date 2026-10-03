# 巨山超力霸 RAG 知识库

## 目录

- `documents/`：经过人工审核的 Markdown 知识卡片。
- `manifest.json`：允许进入索引的卡片清单。
- `ingest.js`：读取卡片并调用 Ollama 生成向量索引。
- `retrieve.js`：运行时语义检索、相似度过滤和引用去重。
- `index.json`：自动生成的本地向量索引，不要手工修改。

## 新增知识卡片

1. 在 `documents/` 新增一个 Markdown 文件。
2. 填写 `id`、来源、适用地区、复核时间、失效时间和审核状态。
3. 只写经过核对的摘要，不要整篇复制网页，也不要加入用户聊天记录。
4. 将文件登记到 `manifest.json`，状态设为 `approved`。
5. 在 `server` 目录重新生成索引：

```powershell
npm run rag:build
```

6. 执行测试：

```powershell
npm test
```

## 运行要求

首次使用需安装嵌入模型：

```powershell
ollama pull bge-m3
```

服务启动后，可通过 `http://localhost:3001/api/health` 查看 RAG 是否启用、文档数和片段数。

## 安全要求

- 危机检测必须始终先于 RAG 和模型调用。
- 过期卡片不会参与检索；重新构建索引时遇到过期卡片会直接失败。
- 药物、诊断和紧急信息必须人工复核。
- 热线及地区性资源建议至少每三个月核验一次。
