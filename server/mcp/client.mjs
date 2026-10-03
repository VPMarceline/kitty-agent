import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_TOOLS = new Set(["search_products"]);
let clientPromise;

async function connect() {
  const client = new Client({ name: "cat-agent-host", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, "product-server.mjs")],
    cwd: path.join(__dirname, ".."),
    stderr: "inherit",
  });
  await client.connect(transport);
  return client;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

export async function listShoppingTools() {
  const client = await getClient();
  const { tools } = await client.listTools();
  return tools.filter((tool) => ALLOWED_TOOLS.has(tool.name));
}

export async function callShoppingTool(name, args) {
  if (!ALLOWED_TOOLS.has(name)) throw new Error(`未授权的 MCP 工具：${name}`);
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const message = result.content?.find((item) => item.type === "text")?.text;
    throw new Error(message || `${name} 执行失败`);
  }
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : {};
}

export async function closeShoppingMcp() {
  if (!clientPromise) return;
  const client = await clientPromise;
  clientPromise = undefined;
  await client.close();
}
