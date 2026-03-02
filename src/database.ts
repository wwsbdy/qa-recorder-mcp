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

export function deleteRecord(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM qa_records WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function updateRecord(id: number, fields: Partial<Omit<QaRecord, "id" | "created_at">>): QaRecord | null {
  const db = getDb();
  try {
    const sets: string[] = [];
    const values: string[] = [];
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return null;
    values.push(String(id));
    db.prepare(`UPDATE qa_records SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM qa_records WHERE id = ?").get(id) as QaRecord | null;
  } finally {
    db.close();
  }
}

export function searchRecords(keyword: string, categories?: string[]): QaRecord[] {
  const db = getDb();
  try {
    let sql = "SELECT * FROM qa_records WHERE (question LIKE ? OR solution LIKE ? OR scene LIKE ?)";
    const bindings: string[] = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`];
    if (categories && categories.length > 0) {
      sql += ` AND category IN (${categories.map(() => "?").join(", ")})`;
      bindings.push(...categories);
    }
    sql += " ORDER BY created_at DESC";
    return db.prepare(sql).all(...bindings) as QaRecord[];
  } finally {
    db.close();
  }
}

export function statsRecords(params?: {
  type?: "this_week" | "last_week" | "this_month" | "last_month";
  startDate?: string;
  endDate?: string;
  categories?: string[];
}): { category: string; count: number }[] {
  const db = getDb();
  try {
    let sql = "SELECT category, COUNT(*) as count FROM qa_records WHERE 1=1";
    const bindings: string[] = [];
    if (params?.type === "this_week") {
      sql += " AND created_at >= date('now', 'localtime', 'weekday 0', '-6 days')";
    } else if (params?.type === "last_week") {
      sql += " AND created_at >= date('now', 'localtime', 'weekday 0', '-13 days') AND created_at < date('now', 'localtime', 'weekday 0', '-6 days')";
    } else if (params?.type === "this_month") {
      sql += " AND created_at >= date('now', 'localtime', 'start of month')";
    } else if (params?.type === "last_month") {
      sql += " AND created_at >= date('now', 'localtime', 'start of month', '-1 month') AND created_at < date('now', 'localtime', 'start of month')";
    } else {
      if (params?.startDate) { sql += " AND created_at >= ?"; bindings.push(params.startDate); }
      if (params?.endDate) { sql += " AND created_at <= ?"; bindings.push(params.endDate + " 23:59:59"); }
    }
    if (params?.categories && params.categories.length > 0) {
      sql += ` AND category IN (${params.categories.map(() => "?").join(", ")})`;
      bindings.push(...params.categories);
    }
    sql += " GROUP BY category ORDER BY count DESC";
    return db.prepare(sql).all(...bindings) as { category: string; count: number }[];
  } finally {
    db.close();
  }
}

export function queryRecords(params: {
  type?: "this_week" | "last_week" | "this_month" | "last_month";
  startDate?: string;
  endDate?: string;
  categories?: string[];
}): QaRecord[] {
  const db = getDb();
  try {
    let sql = "SELECT * FROM qa_records WHERE 1=1";
    const bindings: string[] = [];

    if (params.type === "this_week") {
      sql += " AND created_at >= date('now', 'localtime', 'weekday 0', '-6 days')";
    } else if (params.type === "last_week") {
      sql += " AND created_at >= date('now', 'localtime', 'weekday 0', '-13 days') AND created_at < date('now', 'localtime', 'weekday 0', '-6 days')";
    } else if (params.type === "this_month") {
      sql += " AND created_at >= date('now', 'localtime', 'start of month')";
    } else if (params.type === "last_month") {
      sql += " AND created_at >= date('now', 'localtime', 'start of month', '-1 month') AND created_at < date('now', 'localtime', 'start of month')";
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
