import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_DIR = path.join(os.homedir(), ".qa-recorder-mcp");
const DB_PATH = path.join(DB_DIR, "records.db");

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function getDb(): Database.Database {
  ensureDbDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '其他',
      scene TEXT NOT NULL,
      question TEXT NOT NULL,
      solution TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);
  // 兼容旧表：如果 category 列不存在则添加
  const columns = db.prepare("PRAGMA table_info(qa_records)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "category")) {
    db.exec("ALTER TABLE qa_records ADD COLUMN category TEXT NOT NULL DEFAULT '其他'");
  }
  return db;
}

export interface QaRecord {
  id?: number;
  time: string;
  category: string;
  scene: string;
  question: string;
  solution: string;
  created_at?: string;
}

export function insertRecord(record: Omit<QaRecord, "id" | "created_at">): QaRecord {
  const db = getDb();
  try {
    const stmt = db.prepare(
      "INSERT INTO qa_records (time, category, scene, question, solution) VALUES (?, ?, ?, ?, ?)"
    );
    const result = stmt.run(record.time, record.category, record.scene, record.question, record.solution);
    return { ...record, id: Number(result.lastInsertRowid) };
  } finally {
    db.close();
  }
}

export function hasRecords(): boolean {
  const db = getDb();
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM qa_records").get() as { count: number };
    return row.count > 0;
  } finally {
    db.close();
  }
}

export function queryRecords(params: {
  type?: "week" | "month";
  startDate?: string;
  endDate?: string;
  categories?: string[];
}): QaRecord[] {
  const db = getDb();
  try {
    let sql = "SELECT * FROM qa_records WHERE 1=1";
    const bindings: string[] = [];

    if (params.type === "week") {
      sql += " AND created_at >= datetime('now', 'localtime', '-7 days')";
    } else if (params.type === "month") {
      sql += " AND created_at >= datetime('now', 'localtime', '-1 month')";
    } else {
      if (params.startDate) {
        sql += " AND created_at >= ?";
        bindings.push(params.startDate);
      }
      if (params.endDate) {
        sql += " AND created_at <= ?";
        bindings.push(params.endDate + " 23:59:59");
      }
    }

    if (params.categories && params.categories.length > 0) {
      const placeholders = params.categories.map(() => "?").join(", ");
      sql += ` AND category IN (${placeholders})`;
      bindings.push(...params.categories);
    }

    sql += " ORDER BY created_at DESC";
    const stmt = db.prepare(sql);
    return stmt.all(...bindings) as QaRecord[];
  } finally {
    db.close();
  }
}
