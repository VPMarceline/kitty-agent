import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const require = createRequire(import.meta.url);
const { searchProducts } = require("../shopping/service");

const budgetSchema = z
  .object({
    min: z.number().nonnegative().nullable().optional(),
    max: z.number().nonnegative().nullable().optional(),
    currency: z.literal("CNY").optional(),
  })
  .optional();

function createProductServer() {
  const server = new McpServer({ name: "cat-agent-shopping", version: "1.0.0" });

  server.registerTool(
    "search_products",
    {
      title: "通用商品搜索",
      description: "根据商品名称、预算、属性和排除条件搜索京东、淘宝与天猫候选商品。",
      inputSchema: z.object({
        query: z.string().min(2).max(40).describe("简短商品名称，例如机械键盘、手机、猫粮"),
        category: z.string().max(40).optional(),
        budget: budgetSchema,
        attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        excluded_attributes: z.array(z.string().max(30)).max(8).optional(),
        platforms: z.array(z.enum(["jd", "taobao"])).max(2).optional(),
        sort_by: z.enum(["relevance", "price", "value"]).optional(),
        max_results: z.number().int().min(1).max(10).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await searchProducts(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `商品搜索失败：${error.message}` }],
        };
      }
    }
  );

  return server;
}

serveStdio(createProductServer);
console.error("商品搜索 MCP Server 已启动");
