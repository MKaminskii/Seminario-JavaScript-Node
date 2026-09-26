import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { lerCookies } from './http.js';

export const DURACAO_SESSAO_SEGUNDOS = 7200; // 2 horas

export function hashSenha(senhaTexto) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(senhaTexto, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

export function senhaConfere(senhaTexto, senhaSalva) {
  const [sal, hashSalvo] = senhaSalva.split(':');
  const hashDigitado = scryptSync(senhaTexto, sal, 64);
  const bufferSalvo = Buffer.from(hashSalvo, 'hex');

  if (bufferSalvo.length !== hashDigitado.length) return false;
  return timingSafeEqual(hashDigitado, bufferSalvo);
}

export const HASH_FICTICIO = hashSenha(randomUUID());

const inserirSessao = db.prepare(
  'INSERT INTO sessoes (id, usuario_id, csrf, expira_em) VALUES (?, ?, ?, ?)'
);

const buscarSessao = db.prepare(`
  SELECT sessoes.id, sessoes.usuario_id, sessoes.csrf, sessoes.expira_em, usuarios.nome
  FROM sessoes JOIN usuarios ON usuarios.id = sessoes.usuario_id
  WHERE sessoes.id = ?
`);

const apagarSessaoPorId = db.prepare('DELETE FROM sessoes WHERE id = ?');

const apagarSessoesVencidas = db.prepare('DELETE FROM sessoes WHERE expira_em <= ?');

export function criarSessao(usuarioId) {
  limparSessoesVencidas();

  const id = randomUUID();
  const csrf = randomUUID();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_SEGUNDOS * 1000).toISOString();

  inserirSessao.run(id, usuarioId, csrf, expiraEm);
  return id;
}

export function lerSessao(req) {
  const { sid } = lerCookies(req);
  if (!sid) return null;

  const sessao = buscarSessao.get(sid);
  if (!sessao) return null;

  if (new Date(sessao.expira_em) <= new Date()) {
    apagarSessaoPorId.run(sid);
    return null;
  }

  return sessao;
}

export function fecharSessao(sessaoId) {
  apagarSessaoPorId.run(sessaoId);
}

export function limparSessoesVencidas() {
  apagarSessoesVencidas.run(new Date().toISOString());
}
