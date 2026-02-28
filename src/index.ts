#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { insertRecord, queryRecords, hasRecords } from "./database.js";

const server = new McpServer({
  name: "qa-recorder",
  version: "1.0.0",
});

// 检查是否有记录
server.tool(
  "has_records",
  "检查问题记录器中是否有数据",
  {},
  async () => {
    const exists = hasRecords();
    return {
      content: [
        {
          type: "text" as const,
          text: exists ? "有记录数据。" : "暂无记录数据。",
        },
      ],
    };
  }
);

// 记录工具：只记录编程、技术相关问题
server.tool(
  "record_qa",
  "记录一次编程/技术相关的提问（非编程、非技术问题不要记录），包含时间、问题类型、场景、问题和解决方法",
  {
    time: z.string().describe("提问时间，如 2026-02-28 10:00"),
    category: z.string().describe("问题类型，如：编程、编程解答、无关编程、其他"),
    scene: z.string().describe("场景描述，如：开发MCP插件"),
    question: z.string().describe("提问的问题"),
    solution: z.string().describe("解决方法"),
  },
  async ({ time, category, scene, question, solution }) => {
    const record = insertRecord({ time, category, scene, question, solution });
    return {
      content: [
        {
          type: "text" as const,
          text: `已记录（ID: ${record.id}）\n时间：${record.time}\n类型：${record.category}\n场景：${record.scene}\n问题：${record.question}\n解决方法：${record.solution}`,
        },
      ],
    };
  }
);

// 查询工具：按周度、月度或时间范围查询记录
server.tool(
  "query_qa",
  "查询提问记录，支持按周度、月度或自定义时间范围查询，支持按问题类型筛选",
  {
    type: z
      .enum(["week", "month", "custom"])
      .optional()
      .describe("查询类型：week=最近一周, month=最近一月, custom=自定义范围"),
    startDate: z
      .string()
      .optional()
      .describe("起始日期（type=custom时使用），格式 YYYY-MM-DD"),
    endDate: z
      .string()
      .optional()
      .describe("结束日期（type=custom时使用），格式 YYYY-MM-DD"),
    categories: z
      .array(z.string())
      .optional()
      .describe("问题类型筛选，支持多个，如：['编程', '编程解答']"),
  },
  async ({ type, startDate, endDate, categories }) => {
    const records = queryRecords({
      type: type === "custom" ? undefined : type,
      startDate: type === "custom" ? startDate : undefined,
      endDate: type === "custom" ? endDate : undefined,
      categories,
    });

    if (records.length === 0) {
      return {
        content: [{ type: "text" as const, text: "没有找到匹配的记录。" }],
      };
    }

    const text = records
      .map(
        (r, i) =>
          `【${i + 1}】\n时间：${r.time}\n类型：${r.category}\n场景：${r.scene}\n问题：${r.question}\n解决方法：${r.solution}\n记录于：${r.created_at}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `共 ${records.length} 条记录：\n\n${text}`,
        },
      ],
    };
  }
);

// 启动服务
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
