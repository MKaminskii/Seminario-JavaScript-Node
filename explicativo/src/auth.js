// src/auth.js

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { lerCookies } from './http.js';

// Duração da sessão, em segundos. É o único lugar onde esse número existe:
// o banco (expira_em, logo abaixo) e o cookie (Max-Age, em server.js) usam
// este mesmo valor.
export const DURACAO_SESSAO_SEGUNDOS = 2 * 60 * 60; // 2 horas

// ---------------------------------------------------------------------------
// Senhas — nunca guardamos a senha em si, guardamos "sal:hash"
// ---------------------------------------------------------------------------

// O "sal" é um valor aleatório por usuário: duas pessoas com a mesma senha
// terminam com registros diferentes no banco. scrypt é de propósito lento e
// pesado, para que testar milhões de senhas fique inviável.
export function hashSenha(senhaTexto) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(senhaTexto, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

// Refaz o mesmo embaralhamento com a senha digitada agora e compara com o
// que está salvo. timingSafeEqual evita que a comparação vaze informação
// por demorar um pouquinho mais ou menos dependendo de quantos bytes batem.
export function senhaConfere(senhaTexto, senhaSalva) {
  const [sal, hashSalvo] = senhaSalva.split(':');
  const hashDigitado = scryptSync(senhaTexto, sal, 64);
  const bufferSalvo = Buffer.from(hashSalvo, 'hex');

  if (bufferSalvo.length !== hashDigitado.length) return false;
  return timingSafeEqual(hashDigitado, bufferSalvo);
}

// Hash de uma senha aleatória que ninguém conhece. Serve só para o login
// gastar o mesmo tempo quando o nome digitado não existe (ver server.js).
export const HASH_FICTICIO = hashSenha(randomUUID());

// ---------------------------------------------------------------------------
// Sessões — a "pulseira" que o servidor usa para lembrar quem é quem
// ---------------------------------------------------------------------------

const inserirSessao = db.prepare(
  'INSERT INTO sessoes (id, usuario_id, csrf, expira_em) VALUES (?, ?, ?, ?)'
);

const buscarSessao = db.prepare(`
  SELECT sessoes.id, sessoes.usuario_id, sessoes.csrf, sessoes.expira_em, usuarios.nome
  FROM sessoes JOIN usuarios ON usuarios.id = sessoes.usuario_id
  WHERE sessoes.id = ?
`);

const apagarSessaoPorId = db.prepare('DELETE FROM sessoes WHERE id = ?');

// As datas ficam no formato ISO em UTC ("2026-09-16T18:00:00.000Z"), que
// pode ser comparado como texto: ordem alfabética = ordem cronológica.
const apagarSessoesVencidas = db.prepare('DELETE FROM sessoes WHERE expira_em <= ?');

// Sorteia o número da sessão, grava na tabela "sessoes" e devolve esse número,
// que é o valor que vai no cookie (ver server.js).
export function criarSessao(usuarioId) {
  limparSessoesVencidas(); // aproveita o momento para tirar sessões abandonadas

  const id = randomUUID(); // 122 bits sorteados por um gerador criptográfico: impossível de adivinhar
  const csrf = randomUUID(); // código secreto desta sessão, usado nos formulários
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_SEGUNDOS * 1000).toISOString();

  inserirSessao.run(id, usuarioId, csrf, expiraEm);
  return id;
}

// Lê o cookie "sid" da requisição e consulta a tabela sessoes para
// descobrir quem está do outro lado. Devolve null se não há cookie, se a
// sessão não existe mais, ou se ela já venceu.
//
// O prazo é conferido aqui, no servidor. O Max-Age do cookie é só um pedido
// ao navegador: quem copiou o valor do cookie pode continuar mandando ele.
export function lerSessao(req) {
  const { sid } = lerCookies(req);
  if (!sid) return null;

  const sessao = buscarSessao.get(sid);
  if (!sessao) return null;

  if (new Date(sessao.expira_em) <= new Date()) {
    apagarSessaoPorId.run(sid); // sessão vencida: aproveita e já limpa
    return null;
  }

  return sessao; // { id, usuario_id, csrf, expira_em, nome }
}

// Usada ao clicar em "Sair": apaga a linha do banco. Só limpar o cookie não
// bastaria — quem tivesse copiado o valor continuaria entrando.
export function fecharSessao(sessaoId) {
  apagarSessaoPorId.run(sessaoId);
}

// Apaga do banco todas as sessões que já venceram, inclusive as de quem
// fechou o navegador e nunca mais voltou (essas nunca passariam por lerSessao).
export function limparSessoesVencidas() {
  apagarSessoesVencidas.run(new Date().toISOString());
}
