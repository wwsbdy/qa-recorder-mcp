#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { insertRecord, queryRecords, hasRecords, deleteRecord, updateRecord, searchRecords, statsRecords } from "./database.js";

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

// 记录工具：记录所有提问
server.tool(
  "record_qa",
  "记录一次提问,包含时间、问题类型、场景、问题和解决方法",
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
      .enum(["this_week", "last_week", "this_month", "last_month", "custom"])
      .optional()
      .describe("查询类型：this_week=本周, last_week=上周, this_month=本月, last_month=上月, custom=自定义范围"),
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

// 删除记录
server.tool(
  "delete_qa",
  "删除指定ID的提问记录",
  {
    id: z.number().describe("要删除的记录ID"),
  },
  async ({ id }) => {
    const deleted = deleteRecord(id);
    return {
      content: [
        {
          type: "text" as const,
          text: deleted ? `已删除记录（ID: ${id}）` : `未找到记录（ID: ${id}）`,
        },
      ],
    };
  }
);

// 修改记录
server.tool(
  "update_qa",
  "修改指定ID的提问记录，可更新时间、类型、场景、问题、解决方法中的任意字段",
  {
    id: z.number().describe("要修改的记录ID"),
    time: z.string().optional().describe("新的提问时间"),
    category: z.string().optional().describe("新的问题类型"),
    scene: z.string().optional().describe("新的场景描述"),
    question: z.string().optional().describe("新的问题"),
    solution: z.string().optional().describe("新的解决方法"),
  },
  async ({ id, ...fields }) => {
    const record = updateRecord(id, fields);
    if (!record) {
      return { content: [{ type: "text" as const, text: `未找到记录（ID: ${id}）或无更新字段` }] };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `已更新（ID: ${record.id}）\n时间：${record.time}\n类型：${record.category}\n场景：${record.scene}\n问题：${record.question}\n解决方法：${record.solution}`,
        },
      ],
    };
  }
);

// 关键词搜索
server.tool(
  "search_qa",
  "按关键词搜索提问记录，在问题、解决方法、场景中模糊匹配",
  {
    keyword: z.string().describe("搜索关键词"),
    categories: z.array(z.string()).optional().describe("问题类型筛选"),
  },
  async ({ keyword, categories }) => {
    const records = searchRecords(keyword, categories);
    if (records.length === 0) {
      return { content: [{ type: "text" as const, text: "没有找到匹配的记录。" }] };
    }
    const text = records
      .map((r, i) => `【${i + 1}】ID:${r.id}\n时间：${r.time}\n类型：${r.category}\n场景：${r.scene}\n问题：${r.question}\n解决方法：${r.solution}`)
      .join("\n\n");
    return { content: [{ type: "text" as const, text: `共 ${records.length} 条匹配记录：\n\n${text}` }] };
  }
);

// 统计分析
server.tool(
  "stats_qa",
  "统计提问记录，按问题类型分组统计数量",
  {
    type: z
      .enum(["this_week", "last_week", "this_month", "last_month", "custom"])
      .optional()
      .describe("查询类型：this_week=本周, last_week=上周, this_month=本月, last_month=上月, custom=自定义范围"),
    startDate: z.string().optional().describe("起始日期（type=custom时使用），格式 YYYY-MM-DD"),
    endDate: z.string().optional().describe("结束日期（type=custom时使用），格式 YYYY-MM-DD"),
    categories: z.array(z.string()).optional().describe("问题类型筛选"),
  },
  async ({ type, startDate, endDate, categories }) => {
    const stats = statsRecords({
      type: type === "custom" ? undefined : type,
      startDate: type === "custom" ? startDate : undefined,
      endDate: type === "custom" ? endDate : undefined,
      categories,
    });
    if (stats.length === 0) {
      return { content: [{ type: "text" as const, text: "暂无记录数据。" }] };
    }
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const text = stats.map((s) => `${s.category}：${s.count} 条`).join("\n");
    return { content: [{ type: "text" as const, text: `共 ${total} 条记录：\n${text}` }] };
  }
);

// 导出记录
server.tool(
  "export_qa",
  "导出提问记录为 markdown 或 JSON 格式文本",
  {
    format: z.enum(["markdown", "json"]).describe("导出格式：markdown 或 json"),
    type: z.enum(["this_week", "last_week", "this_month", "last_month", "all"]).optional().describe("时间范围：this_week/last_week/this_month/last_month/all，默认all"),
  },
  async ({ format, type }) => {
    const records = queryRecords({
      type: type === "all" || !type ? undefined : type,
    });
    if (records.length === 0) {
      return { content: [{ type: "text" as const, text: "没有记录可导出。" }] };
    }
    let text: string;
    if (format === "json") {
      text = JSON.stringify(records, null, 2);
    } else {
      text = records
        .map(
          (r) =>
            `## ${r.question}\n\n- 时间：${r.time}\n- 类型：${r.category}\n- 场景：${r.scene}\n- 解决方法：${r.solution}\n- 记录于：${r.created_at}`
        )
        .join("\n\n---\n\n");
    }
    return { content: [{ type: "text" as const, text }] };
  }
);

// 启动服务
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
