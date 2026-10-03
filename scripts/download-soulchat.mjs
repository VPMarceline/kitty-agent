import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const repoId = "YIRONGCHEN/SoulChatCorpus";
const revision = "master";
const targetDir = join(process.cwd(), "data", "raw", "SoulChatCorpus");
const treeUrl = `https://www.modelscope.cn/api/v1/datasets/${repoId}/repo/tree?Revision=${revision}&Root=`;

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`下载请求失败：${response.status} ${response.statusText}`);
  }

  return response;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const file = await open(filePath, "r");

  try {
    for await (const chunk of file.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await file.close();
  }

  return hash.digest("hex");
}

async function downloadFile(file) {
  const destination = join(targetDir, file.Path);
  const partial = `${destination}.part`;
  await mkdir(dirname(destination), { recursive: true });

  try {
    const existing = await stat(destination);
    if (existing.size === file.Size && (await sha256(destination)) === file.Sha256) {
      console.log(`已存在并通过校验：${file.Path}`);
      return;
    }
  } catch {
    // 文件不存在时继续下载。
  }

  let downloaded = 0;
  try {
    downloaded = (await stat(partial)).size;
  } catch {
    downloaded = 0;
  }

  if (downloaded > file.Size) {
    await rm(partial, { force: true });
    downloaded = 0;
  }

  const fileUrl = `https://www.modelscope.cn/api/v1/datasets/${repoId}/repo?Revision=${revision}&FilePath=${encodeURIComponent(file.Path)}`;
  const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};
  const response = await request(fileUrl, { headers });
  const canResume = downloaded > 0 && response.status === 206;

  if (downloaded > 0 && !canResume) {
    await rm(partial, { force: true });
    downloaded = 0;
  }

  const startedAt = Date.now();
  let received = downloaded;
  let lastReport = 0;
  const progressStream = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      const now = Date.now();
      if (now - lastReport > 5000 || received === file.Size) {
        const percent = ((received / file.Size) * 100).toFixed(1);
        const elapsed = Math.max((now - startedAt) / 1000, 1);
        const speed = ((received - downloaded) / 1024 / 1024 / elapsed).toFixed(1);
        console.log(`${file.Path}: ${percent}% (${speed} MB/s)`);
        lastReport = now;
      }
      controller.enqueue(chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(progressStream)),
    createWriteStream(partial, { flags: downloaded > 0 ? "a" : "w" })
  );

  const finalSize = (await stat(partial)).size;
  if (finalSize !== file.Size) {
    throw new Error(`${file.Path} 大小不完整：${finalSize}/${file.Size}`);
  }

  const digest = await sha256(partial);
  if (digest !== file.Sha256) {
    throw new Error(`${file.Path} SHA-256 校验失败：${digest}`);
  }

  await rename(partial, destination);
  console.log(`下载并校验完成：${file.Path}`);
}

await mkdir(targetDir, { recursive: true });
const treeResponse = await request(treeUrl);
const tree = await treeResponse.json();

if (tree.Code !== 200 || !Array.isArray(tree.Data?.Files)) {
  throw new Error(`无法读取数据集文件清单：${JSON.stringify(tree)}`);
}

const files = tree.Data.Files.filter((file) => file.Type === "blob");
await writeFile(
  join(targetDir, "source-manifest.json"),
  `${JSON.stringify(
    {
      source: `https://www.modelscope.cn/datasets/${repoId}`,
      repoId,
      revision,
      downloadedAt: new Date().toISOString(),
      files: files.map((file) => ({
        path: file.Path,
        size: file.Size,
        sha256: file.Sha256,
        lfs: file.IsLFS,
      })),
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`文件数：${files.length}`);
console.log(`总大小：${(files.reduce((sum, file) => sum + file.Size, 0) / 1024 / 1024).toFixed(1)} MB`);

for (const file of files) {
  await downloadFile(file);
}

console.log(`SoulChatCorpus 已完整保存到：${targetDir}`);
