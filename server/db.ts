import Database from 'better-sqlite3'

export function getServerDb(path: string = process.env.DATABASE_PATH ?? 'log.db'): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Core artifact tables (mirrors src/db/schema.ts — additive only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      canvas_x REAL, canvas_y REAL, canvas_w REAL, canvas_h REAL,
      created_at INTEGER, updated_at INTEGER, synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS artifact_links (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES artifacts(id),
      target_id TEXT REFERENCES artifacts(id),
      strength REAL NOT NULL,
      link_type TEXT,
      tags TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      artifact_id TEXT REFERENCES artifacts(id),
      embedding_model TEXT,
      content TEXT,
      embedding BLOB,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      otp TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inference_log (
      id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  // Additive migrations for artifact_links columns added in peo-115
  const linkCols = db.pragma('table_info(artifact_links)') as Array<{ name: string }>
  const linkColNames = linkCols.map(c => c.name)
  if (!linkColNames.includes('provenance')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN provenance TEXT NOT NULL DEFAULT 'user-made'`)
  }
  if (!linkColNames.includes('confidence')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0`)
  }

  return db
}
