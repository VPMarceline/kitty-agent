# 上传到 GitHub

GitHub 不会自动把 ZIP 解压成仓库。请先解压本项目，或直接使用同名未压缩文件夹，然后执行以下操作。

## 1. 在 GitHub 创建空仓库

创建仓库时不要勾选自动生成 README、`.gitignore` 或 License，避免第一次推送发生冲突。

## 2. 本地初始化并推送

在项目根目录打开 PowerShell：

```powershell
git init
git add .
git status
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

执行 `git add .` 后先查看 `git status`，确认没有以下内容：

- `node_modules/`、`client/dist/`
- `.env`、私钥或访问令牌
- `server/data/*.db*`
- `data/raw/`、`data/processed/`
- 模型权重、Adapter 和训练输出

如果 Git 提示没有设置身份，可先执行：

```powershell
git config --global user.name "你的 GitHub 用户名"
git config --global user.email "你的 GitHub 邮箱"
```

## 3. 后续更新

```powershell
git add .
git commit -m "描述本次修改"
git push
```

## GitHub 网页上传

也可以把未压缩文件夹中的文件拖入 GitHub 网页，但命令行方式更可靠，并能保留完整目录结构。不要把 ZIP 文件本身当作项目源代码提交。
