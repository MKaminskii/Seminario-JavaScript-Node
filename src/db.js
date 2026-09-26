import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CAMINHO_BANCO = process.env.MURAL_DB ?? join(__dirname, '..', 'mural.db');

export const db = new DatabaseSync(CAMINHO_BANCO);

db.exec('PRAGMA foreign_keys = ON');

db.exec('PRAGMA busy_timeout = 2000');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS recados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    texto      TEXT NOT NULL,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessoes (
    id         TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    csrf       TEXT NOT NULL,
    expira_em  TEXT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )
`);

console.log(`[banco] SQLite pronto em ${CAMINHO_BANCO}`);
