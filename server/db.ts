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

  // Additive migration: artifact_id on inference_log (PEO-118)
  const infLogCols = db.pragma('table_info(inference_log)') as Array<{ name: string }>
  const infLogColNames = infLogCols.map(c => c.name)
  if (!infLogColNames.includes('artifact_id')) {
    db.exec(`ALTER TABLE inference_log ADD COLUMN artifact_id TEXT NOT NULL DEFAULT ''`)
  }

  // Additive migrations for artifact_links columns added in peo-115
  const linkCols = db.pragma('table_info(artifact_links)') as Array<{ name: string }>
  const linkColNames = linkCols.map(c => c.name)
  if (!linkColNames.includes('provenance')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN provenance TEXT NOT NULL DEFAULT 'user-made'`)
  }
  if (!linkColNames.includes('confidence')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0`)
  }

  // Unique pair index so linking runs can upsert (PEO-122)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_links_pair ON artifact_links(source_id, target_id)`)

  // Additive migrations for PEO-123
  if (!linkColNames.includes('rationale')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN rationale TEXT`)
  }

  // Schema migrations table — tracks which migrations have run (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)

  const hasMigration = (id: string): boolean =>
    !!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)

  const markMigration = (id: string): void => {
    db.prepare('INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, Date.now())
  }

  // Create link_feedback if it doesn't exist yet (original path).
  // link_feedback is an event log — link_id is stored as plain TEXT so audit
  // rows survive link deletion (no FK so no cascade or null-out on delete).
  const feedbackCols = db.pragma('table_info(link_feedback)') as Array<{ name: string }>
  if (feedbackCols.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS link_feedback (
        id TEXT PRIMARY KEY,
        link_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    markMigration('link_feedback_fk_v1')
  }

  // Migration: remove FK from link_feedback.link_id so audit rows survive link deletion.
  // SQLite cannot ALTER columns, so we recreate the table and copy rows.
  if (!hasMigration('link_feedback_fk_v1')) {
    db.exec(`
      BEGIN;
      CREATE TABLE link_feedback_new (
        id TEXT PRIMARY KEY,
        link_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO link_feedback_new SELECT id, link_id, action, created_at FROM link_feedback;
      DROP TABLE link_feedback;
      ALTER TABLE link_feedback_new RENAME TO link_feedback;
      COMMIT;
    `)
    markMigration('link_feedback_fk_v1')
  }

  // Additive migration: clusters table (PEO-124)
  db.exec(`
    CREATE TABLE IF NOT EXISTS clusters (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      artifact_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  // Ink strokes table (PEO-126)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ink_strokes (
      id TEXT PRIMARY KEY,
      points TEXT NOT NULL,
      color TEXT NOT NULL,
      width REAL NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  return db
}
