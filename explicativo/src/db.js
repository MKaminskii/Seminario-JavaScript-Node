// src/db.js
//
// Usamos o node:sqlite, que vem embutido no Node desde a versão 22.5: o
// banco inteiro é um único arquivo, mural.db, criado na primeira vez que o
// servidor roda. Nenhum "npm install" e nenhum servidor de banco separado
// (um MySQL, por exemplo, exigiria as duas coisas).

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Normalmente o banco é o arquivo mural.db na pasta do projeto. Os testes
// automáticos usam a variável MURAL_DB para apontar para um arquivo
// temporário e não misturar dados de teste com os seus.
const CAMINHO_BANCO = process.env.MURAL_DB ?? join(__dirname, '..', 'mural.db');

export const db = new DatabaseSync(CAMINHO_BANCO);

// O SQLite, por padrão, não verifica chaves estrangeiras. Sem esta linha,
// seria possível ter um recado com usuario_id apontando para um usuário
// que não existe.
db.exec('PRAGMA foreign_keys = ON');

// Se outro programa estiver com o banco travado (por exemplo, um
// visualizador de SQLite com alterações ainda não salvas), espera até 2
// segundos antes de desistir, em vez de falhar na hora. Atenção: o
// node:sqlite é síncrono, então durante essa espera o servidor fica parado.
db.exec('PRAGMA busy_timeout = 2000');

// As três tabelas do sistema (slide "As três tabelas e os três métodos"):
//
//   usuarios  — quem pode entrar no sistema
//   recados   — o que cada usuário publicou no mural
//   sessoes   — quem está logado agora (a "pulseira" de cada visitante)
//
// Os três CREATE TABLE rodam toda vez que o servidor inicia. O
// "IF NOT EXISTS" evita erro quando o arquivo mural.db já existe.
//
// AUTOINCREMENT garante que um id apagado nunca é reaproveitado: um botão
// "apagar" antigo, esquecido aberto em outra aba, não acerta um recado novo.

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE COLLATE NOCASE, -- "Ana" e "ana" contam como o mesmo nome
    senha TEXT NOT NULL                        -- nunca a senha em si: "sal:hash" (ver src/auth.js)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS recados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,           -- o dono do recado
    texto      TEXT NOT NULL,              -- guardado exatamente como foi digitado
    criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessoes (
    id         TEXT PRIMARY KEY,           -- o valor que também vai no cookie "sid"
    usuario_id INTEGER NOT NULL,
    csrf       TEXT NOT NULL,              -- código secreto da sessão (Parte 4)
    expira_em  TEXT NOT NULL,              -- data/hora em UTC, formato ISO
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )
`);

console.log(`[banco] SQLite pronto em ${CAMINHO_BANCO}`);
