import Database from 'better-sqlite3'

export function getDb(path: string = 'log.db'): Database.Database {
  const db = new Database(path)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      canvas_x REAL,
      canvas_y REAL,
      canvas_w REAL,
      canvas_h REAL,
      created_at INTEGER,
      updated_at INTEGER,
      synced_at INTEGER
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
  `)

  // Additive migration: add provenance and confidence to artifact_links if missing
  const cols = db.pragma('table_info(artifact_links)') as Array<{ name: string }>
  const colNames = cols.map(c => c.name)
  if (!colNames.includes('provenance')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN provenance TEXT NOT NULL DEFAULT 'user-made'`)
  }
  if (!colNames.includes('confidence')) {
    db.exec(`ALTER TABLE artifact_links ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0`)
  }

  return db
}
