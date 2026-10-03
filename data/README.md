# 心理支持微调数据

## 目录

- `raw/SoulChatCorpus/`：从 ModelScope 下载的原始快照，只读保留，不直接修改。
- `processed/`：完成格式转换、隐私过滤和安全筛选后的训练/验证数据。
- `../scripts/download-soulchat.mjs`：支持断点续传和 SHA-256 校验的下载脚本。

## 来源与许可

- 来源：`YIRONGCHEN/SoulChatCorpus`
- 页面：https://www.modelscope.cn/datasets/YIRONGCHEN/SoulChatCorpus
- 页面标注许可：Apache License 2.0

数据集包含心理健康对话。即使来源已经做过过滤，也应在训练前再次检查个人信息、危机应答、诊断或药物建议、依赖诱导和不安全内容。不要直接把原始全量数据投入训练。

## 生成微调候选集

```powershell
node scripts/prepare-soulchat.mjs
```

结果保存在 `processed/soulchat-v1/`。脚本会完整扫描原始文件，经过自动安全过滤后使用确定性哈希抽样生成约 8% 的训练候选和互斥的验证候选。自动过滤不能替代心理专业人员的人工审核。

## 重新下载

在项目根目录运行：

```powershell
node scripts/download-soulchat.mjs
```

脚本会跳过已经通过大小与 SHA-256 校验的文件；未完成的文件使用 `.part` 后缀并在下次运行时尝试续传。
