import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { exportGraph } from './graph'

const KEEP_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

function backupFilename(dir: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(dir, `graph-backup-${stamp}.json`)
}

function pruneOldBackups(dir: string): void {
  const files = fs.readdirSync(dir)
    .filter(f => /^graph-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) {
    fs.unlinkSync(path.join(dir, f))
  }
}

export function writeBackup(db: Database.Database, dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const data = exportGraph(db)
  fs.writeFileSync(backupFilename(dir, new Date()), JSON.stringify(data, null, 2), 'utf8')
  pruneOldBackups(dir)
}

export function scheduleNightlyBackup(db: Database.Database, dir: string): NodeJS.Timeout {
  return setInterval(() => writeBackup(db, dir), MS_PER_DAY)
}
