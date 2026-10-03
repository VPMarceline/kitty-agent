# Cat Agent（巨山超力霸）

一个本地优先的 AI Agent 全栈项目：使用 React + Three.js 提供可定制的 3D 像素小猫界面，Express 提供登录、独立会话、长期记忆、RAG 与商品搜索能力，推理由本机 Ollama 中的 Qwen3 4B 完成。

> 本项目提供的是 AI 心理支持，不是心理咨询、医疗诊断或紧急救援服务。生产使用前需要由心理健康、安全与隐私专业人员审查。

## 功能

- 注册、登录、HttpOnly Cookie 会话与 scrypt 密码哈希
- 每个用户独立的 Agent 名称、毛色、头像、会话与记忆
- 最近对话 + 对话摘要 + 用户明确授权的长期记忆
- 危机关键词优先检测与安全响应
- 基于 BGE-M3 向量的本地 RAG 知识库
- 通过 MCP 暴露通用商品搜索工具
- 京东、淘宝、天猫等商品搜索链接与结果整理
- Three.js 3D 像素小猫和交互动画
- QLoRA 数据准备、训练与评估脚本

## 架构

```text
React / Vite / Three.js
        │  /api（Vite 开发代理）
        ▼
Express API ── 登录与用户隔离 ── SQLite
        │
        ├── 危机检测
        ├── 对话摘要与长期记忆
        ├── RAG（BGE-M3 + 本地知识卡片）
        ├── MCP 商品搜索工具
        └── Ollama（kitten-counselor / Qwen3 4B）
```

## 环境要求

- Windows 10/11（核心服务也可在 Linux/macOS 运行）
- Node.js 20.19+ 或 22.12+
- Ollama
- 建议 8 GB 以上显存运行 4B 模型；没有独立显卡时也可使用 CPU，但速度会明显变慢

训练脚本另需 Python 3.10+、CUDA 环境，以及 `requirements-training.txt` 中的依赖。

## 本地启动

### 1. 准备 Ollama 模型

在项目根目录运行：

```powershell
ollama pull qwen3:4b-instruct
ollama pull bge-m3
ollama create kitten-counselor -f .\Modelfile
```

确保 Ollama 正在运行：

```powershell
ollama serve
```

如果桌面版 Ollama 已经启动并占用 `11434` 端口，不需要再次执行 `ollama serve`。

### 2. 启动后端

打开一个 PowerShell：

```powershell
cd .\server
npm ci
npm run dev
```

默认地址为 `http://127.0.0.1:3001`。首次启动会在 `server/data/users.db` 创建 SQLite 数据库。

### 3. 启动前端

再打开一个 PowerShell：

```powershell
cd .\client
npm ci
npm run dev
```

打开终端显示的地址，通常是 `http://localhost:5173`。

## 配置

后端直接读取系统环境变量；`server/.env.example` 只是变量清单，项目不会自动加载 `.env` 文件。在 PowerShell 中可这样设置：

```powershell
$env:MODEL_NAME = "kitten-counselor"
$env:ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:5174"
npm run dev
```

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `3001` | 后端端口 |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api/chat` | Ollama 对话接口 |
| `MODEL_NAME` | `kitten-counselor` | 对话模型名称 |
| `OLLAMA_EMBED_URL` | `http://127.0.0.1:11434/api/embed` | Ollama 嵌入接口 |
| `RAG_EMBED_MODEL` | `bge-m3` | RAG 嵌入模型 |
| `USER_DATABASE_PATH` | `server/data/users.db` | SQLite 数据库路径 |
| `ALLOWED_ORIGINS` | 本地 5173、5174 端口 | 允许跨域访问的前端地址 |
| `NODE_ENV` | 未设置 | 设为 `production` 时启用 Secure Cookie 检查 |

## RAG 知识库

已审核知识卡片位于 `server/rag/documents/`，索引位于 `server/rag/index.json`。修改卡片后重新构建并测试：

```powershell
cd .\server
npm run rag:build
npm test
```

更多规则见 `server/rag/README.md`。

## 微调数据与 QLoRA

出于体积、隐私和许可管理考虑，GitHub 包不包含原始数据、处理后数据、模型权重或 Adapter。数据准备说明见 `data/README.md`。

安装训练依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-training.txt
```

下载基础模型：

```powershell
python .\scripts\download-qwen3-4b.py --output-dir .\models\Qwen3-4B
```

训练脚本的所有输入、模型和输出路径都通过参数传入。先用少量样本执行 smoke test，再进行更长训练；不要未经人工安全审核就把心理对话数据投入生产模型。

## 测试

```powershell
cd .\server
npm test

cd ..\client
npm run lint
npm run build
```

MCP 工具可使用 Inspector 调试：

```powershell
cd .\server
npm run mcp:inspect
```

## 目录

```text
client/                 React、Three.js 前端
server/                 Express API、认证、记忆和会话
server/mcp/             MCP 商品搜索服务与桥接
server/providers/       搜索来源适配器
server/rag/             RAG 文档、索引、检索与测试
server/shopping/        商品搜索请求标准化与服务
scripts/                数据准备、QLoRA 训练和评估脚本
data/                   数据来源与处理说明（数据本体不入库）
Modelfile               Ollama 角色和安全提示词
```

## 隐私与生产注意事项

- 数据库文件已被 `.gitignore` 排除；不要提交账户、会话、头像或聊天记录。
- 当前 SQLite 架构适合本地开发和单机早期版本，多实例部署应迁移到 PostgreSQL，并使用共享会话与限流存储。
- 生产环境必须使用 HTTPS，并补充邮箱验证、找回密码、账户删除、审计、备份和正式隐私政策。
- 商品结果来自公开网页搜索，不等同于电商官方 API；价格、库存和链接在购买前必须再次核验。
- RAG 卡片中的热线和地区性资源应定期人工复核。

## 开源许可

本仓库暂未附加开源许可证。在选择 MIT、Apache-2.0 或其他许可证前，请先确认代码、训练数据、图片和模型各自的许可要求。

