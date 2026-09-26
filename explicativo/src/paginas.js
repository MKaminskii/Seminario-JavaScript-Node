// src/paginas.js
//
// as páginas que o servidor devolve para o
// navegador. Sem framework não há motor de template: uma "página" aqui é
// só uma função que recebe dados e devolve uma string HTML.
//
// Regra de ouro deste arquivo: todo valor que veio do usuário ou do banco
// passa por escaparHtml antes de entrar no HTML.

import { escaparHtml } from './http.js';
import { LIMITES } from './limites.js';

function formatarData(dataSqlite) {
  // SQLite devolve "2026-09-16 14:23:00" (hora UTC, sem fuso indicado).
  // Trocamos o espaço por "T" e acrescentamos "Z" para o JS entender que é UTC.
  return new Date(dataSqlite.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');
}

function layout(titulo, corpo) {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)} · Mural de Recados</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 640px;
    margin: 40px auto;
    padding: 0 16px;
    line-height: 1.5;
  }
  h1 { font-size: 1.4rem; }
  .erro {
    background: #fde2e1; color: #7a1f1a;
    padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;
  }
  form.cartao {
    border: 1px solid #d8d8d8; border-radius: 8px;
    padding: 16px; margin-bottom: 24px;
  }
  label { display: block; font-size: 0.9rem; margin-bottom: 10px; }
  input, textarea, button {
    font: inherit; width: 100%; box-sizing: border-box;
    padding: 8px; margin-top: 4px;
    border: 1px solid #bbb; border-radius: 6px;
  }
  button {
    background: #1a5fb4; color: #fff; border: none; cursor: pointer;
    width: auto; padding: 8px 18px;
  }
  .recado { border-bottom: 1px solid #eee; padding: 12px 0; }
  .recado .texto { white-space: pre-wrap; overflow-wrap: anywhere; } /* mantém as quebras de linha */
  .recado small { color: #777; }
  .form-apagar { display: inline; }
  .apagar {
    background: none; border: none; color: #a51d2d; padding: 0; width: auto;
    text-decoration: underline; cursor: pointer; font-size: 0.85rem;
  }
  .topo { display: flex; justify-content: space-between; align-items: center; }
  .topo form button { background: #666; }
</style>
</head>
<body>
${corpo}
</body>
</html>`;
}

export function paginaLogin({ erro } = {}) {
  return layout('Entrar', `
    <h1>Entrar no mural</h1>
    ${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}
    <form class="cartao" method="POST" action="/login">
      <label>Nome de usuário
        <input name="nome" required autofocus maxlength="${LIMITES.nome}" autocomplete="username">
      </label>
      <label>Senha
        <input type="password" name="senha" required autocomplete="current-password">
      </label>
      <button type="submit">Entrar</button>
    </form>
    <p>Ainda não tem conta? <a href="/cadastro">Cadastre-se</a>.</p>
  `);
}

export function paginaCadastro({ erro } = {}) {
  return layout('Criar conta', `
    <h1>Criar conta</h1>
    ${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}
    <form class="cartao" method="POST" action="/cadastro">
      <label>Nome de usuário (até ${LIMITES.nome} caracteres)
        <input name="nome" required autofocus maxlength="${LIMITES.nome}" autocomplete="username">
      </label>
      <label>Senha (mínimo ${LIMITES.senhaMinima} caracteres)
        <input type="password" name="senha" required minlength="${LIMITES.senhaMinima}" autocomplete="new-password">
      </label>
      <button type="submit">Criar conta</button>
    </form>
    <p>Já tem conta? <a href="/login">Entrar</a>.</p>
  `);
}

// Todo formulário desta página leva o campo escondido "csrf" — publicar,
// apagar e sair. O servidor recusa o envio se o código não bater.
export function paginaMural({ nomeUsuario, usuarioId, recados, csrf }) {
  const campoCsrf = `<input type="hidden" name="csrf" value="${escaparHtml(csrf)}">`;

  const listaRecados = recados.length
    ? recados.map((r) => `
        <div class="recado">
          <div class="texto">${escaparHtml(r.texto)}</div>
          <small>${escaparHtml(r.autor)} · ${escaparHtml(formatarData(r.criado_em))}</small>
          ${r.usuario_id === usuarioId ? `
            <form class="form-apagar" method="POST" action="/recados/${r.id}/apagar">
              ${campoCsrf}
              <button class="apagar" type="submit">apagar</button>
            </form>
          ` : ''}
        </div>
      `).join('')
    : '<p><em>Nenhum recado ainda. Seja a primeira pessoa a publicar!</em></p>';

  return layout('Mural', `
    <div class="topo">
      <h1>Mural de recados</h1>
      <form method="POST" action="/logout">
        ${campoCsrf}
        <button type="submit">Sair (${escaparHtml(nomeUsuario)})</button>
      </form>
    </div>

    <form class="cartao" method="POST" action="/recados">
      ${campoCsrf}
      <label>Novo recado (até ${LIMITES.recado} caracteres)
        <textarea name="texto" rows="3" required maxlength="${LIMITES.recado}"></textarea>
      </label>
      <button type="submit">Publicar</button>
    </form>

    ${listaRecados}
  `);
}

// Página simples para avisos e erros (400, 403, 404, 500).
export function paginaAviso(mensagem) {
  return layout('Aviso', `
    <p class="erro">${escaparHtml(mensagem)}</p>
    <p><a href="/">Voltar para o início</a></p>
  `);
}
