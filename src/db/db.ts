// Two adapters behind one tiny interface: MySQL (production target) and embedded SQLite (demo fallback).
// All SQL in the app is written once, in a subset both engines accept.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../checklist.js";

export type Row = Record<string, any>;

export interface Db {
  kind: "mysql" | "sqlite";
  query(sql: string, params?: unknown[]): Promise<Row[]>;
  exec(sql: string, params?: unknown[]): Promise<void>;
  /** Run fn in one transaction. lockSql is a SELECT ... FOR UPDATE on MySQL; SQLite serializes writers anyway. */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function schemaStatements(kind: "mysql" | "sqlite"): string[] {
  let sql = readFileSync(join(ROOT, "src", "db", "schema.sql"), "utf8");
  sql = sql.replace(/^--.*$/gm, "");
  if (kind === "sqlite") sql = sql.replace(/\)\s*ENGINE=InnoDB/g, ")");
  return sql.split(";").map((s) => s.trim()).filter(Boolean);
}

export async function migrate(db: Db) {
  for (const stmt of schemaStatements(db.kind)) {
    try {
      await db.exec(stmt);
    } catch (e: any) {
      // CREATE INDEX has no IF NOT EXISTS on MySQL; ignore "already exists".
      if (/^CREATE INDEX/i.test(stmt) && (e?.errno === 1061 || /already exists/i.test(String(e?.message)))) continue;
      throw e;
    }
  }
}

export async function openMysql(url: string): Promise<Db> {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({ uri: url, connectionLimit: 5, dateStrings: true, ssl: /ssl=|sslmode=/i.test(url) ? {} : undefined });
  const wrap = (conn: { query: (s: string, p?: any) => Promise<any> }): Omit<Db, "tx" | "close"> => ({
    kind: "mysql",
    async query(sql, params = []) { const [rows] = await conn.query(sql, params); return rows as Row[]; },
    async exec(sql, params = []) { await conn.query(sql, params); },
  });
  const base = wrap(pool);
  return {
    ...base,
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const inner: Db = { ...wrap(conn), tx: (f) => f(inner), close: async () => {} };
        const out = await fn(inner);
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    async close() { await pool.end(); },
  };
}

export async function openSqlite(file: string): Promise<Db> {
  const { default: Database } = await import("better-sqlite3");
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  const fix = (sql: string) => sql.replace(/\s+FOR UPDATE\s*$/i, "");
  const norm = (params: unknown[]) => params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
  let chain: Promise<unknown> = Promise.resolve();
  const base = {
    kind: "sqlite" as const,
    async query(sql: string, params: unknown[] = []) { return d.prepare(fix(sql)).all(...norm(params)) as Row[]; },
    async exec(sql: string, params: unknown[] = []) {
      if (params.length) d.prepare(sql).run(...norm(params));
      else d.exec(sql);
    },
  };
  const db: Db = {
    ...base,
    tx<T>(fn: (q: Db) => Promise<T>): Promise<T> {
      // Serialize transactions so awaits inside one cannot interleave with another.
      const run = chain.then(async () => {
        d.exec("BEGIN IMMEDIATE");
        try {
          const inner: Db = { ...base, tx: (f) => f(inner), close: async () => {} };
          const out = await fn(inner);
          d.exec("COMMIT");
          return out;
        } catch (e) {
          d.exec("ROLLBACK");
          throw e;
        }
      });
      chain = run.catch(() => undefined);
      return run;
    },
    async close() { d.close(); },
  };
  return db;
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const db = url && url.startsWith("mysql") ? await openMysql(url) : await openSqlite(process.env.SQLITE_PATH ?? ":memory:");
  await migrate(db);
  return db;
}
