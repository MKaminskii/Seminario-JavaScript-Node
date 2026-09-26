import { createServer } from 'node:http';
import { createServer as criarServidorHttps } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { db } from './src/db.js';
import { LIMITES } from './src/limites.js';
import { lerCorpo, definirCookie, limparCookie, redirecionar, enviarHtml } from './src/http.js';
import {
  hashSenha,
  senhaConfere,
  HASH_FICTICIO,
  criarSessao,
  lerSessao,
  fecharSessao,
  limparSessoesVencidas,
  DURACAO_SESSAO_SEGUNDOS,
} from './src/auth.js';
import { paginaLogin, paginaCadastro, paginaMural, paginaAviso } from './src/paginas.js';

const PORTA = Number(process.env.PORT ?? 3000);

const buscarUsuarioPorNome = db.prepare('SELECT id, nome, senha FROM usuarios WHERE nome = ?');
const inserirUsuario = db.prepare('INSERT INTO usuarios (nome, senha) VALUES (?, ?)');

const listarRecados = db.prepare(`
  SELECT recados.id, recados.usuario_id, recados.texto, recados.criado_em, usuarios.nome AS autor
  FROM recados JOIN usuarios ON usuarios.id = recados.usuario_id
  ORDER BY recados.id DESC
`);
const inserirRecado = db.prepare('INSERT INTO recados (usuario_id, texto) VALUES (?, ?)');
const apagarRecadoDoDono = db.prepare('DELETE FROM recados WHERE id = ? AND usuario_id = ?');

function entrar(res, usuarioId, sessaoAnterior) {
  if (sessaoAnterior) fecharSessao(sessaoAnterior.id);
  const sid = criarSessao(usuarioId);
  definirCookie(res, 'sid', sid, DURACAO_SESSAO_SEGUNDOS);
  redirecionar(res, '/recados');
}

function csrfConfere(dados, sessao) {
  return dados.csrf === sessao.csrf;
}

function recusarCsrf(res) {
  enviarHtml(res, 403, paginaAviso('Formulário expirado. Volte, recarregue a página e tente de novo.'));
}

function responder404(res) {
  enviarHtml(res, 404, paginaAviso('Página não encontrada.'));
}

function raiz({ res, sessao }) {
  redirecionar(res, sessao ? '/recados' : '/login');
}

function telaLogin({ res, sessao }) {
  if (sessao) return redirecionar(res, '/recados');
  enviarHtml(res, 200, paginaLogin());
}

async function processarLogin({ req, res, sessao }) {
  const dados = await lerCorpo(req);
  const nome = (dados.nome ?? '').trim();
  const senha = dados.senha ?? '';

  const usuario = buscarUsuarioPorNome.get(nome);

  const senhaOk = senhaConfere(senha, usuario ? usuario.senha : HASH_FICTICIO);

  if (!usuario || !senhaOk) {
    return enviarHtml(res, 401, paginaLogin({ erro: 'Usuário ou senha inválidos.' }));
  }

  entrar(res, usuario.id, sessao);
}

function telaCadastro({ res, sessao }) {
  if (sessao) return redirecionar(res, '/recados');
  enviarHtml(res, 200, paginaCadastro());
}

async function processarCadastro({ req, res, sessao }) {
  const dados = await lerCorpo(req);
  const nome = (dados.nome ?? '').trim();
  const senha = dados.senha ?? '';

  if (!nome || nome.length > LIMITES.nome || senha.length < LIMITES.senhaMinima) {
    return enviarHtml(res, 400, paginaCadastro({
      erro: `Use um nome de 1 a ${LIMITES.nome} caracteres e uma senha com pelo menos ${LIMITES.senhaMinima}.`,
    }));
  }

  if (buscarUsuarioPorNome.get(nome)) {
    return enviarHtml(res, 409, paginaCadastro({ erro: 'Esse nome de usuário já existe.' }));
  }

  const { lastInsertRowid } = inserirUsuario.run(nome, hashSenha(senha));
  entrar(res, Number(lastInsertRowid), sessao);
}

function telaMural({ res, sessao }) {
  enviarHtml(res, 200, paginaMural({
    nomeUsuario: sessao.nome,
    usuarioId: sessao.usuario_id,
    recados: listarRecados.all(),
    csrf: sessao.csrf,
  }));
}

async function publicar({ req, res, sessao }) {
  const dados = await lerCorpo(req);
  if (!csrfConfere(dados, sessao)) return recusarCsrf(res);

  const texto = (dados.texto ?? '').trim();

  if (texto.length > LIMITES.recado) {
    return enviarHtml(res, 400, paginaAviso(`O recado pode ter no máximo ${LIMITES.recado} caracteres.`));
  }

  if (texto) inserirRecado.run(sessao.usuario_id, texto);
  redirecionar(res, '/recados');
}

async function apagarRecado({ req, res, sessao, params }) {
  const dados = await lerCorpo(req);
  if (!csrfConfere(dados, sessao)) return recusarCsrf(res);

  const [id] = params;
  apagarRecadoDoDono.run(Number(id), sessao.usuario_id);
  redirecionar(res, '/recados');
}

async function sair({ req, res, sessao }) {
  const dados = await lerCorpo(req);
  if (!csrfConfere(dados, sessao)) return recusarCsrf(res);

  fecharSessao(sessao.id);
  limparCookie(res, 'sid');
  redirecionar(res, '/login');
}

const rotas = [
  { metodo: 'GET',  caminho: /^\/$/,                        protegida: false, fn: raiz },
  { metodo: 'GET',  caminho: /^\/login$/,                   protegida: false, fn: telaLogin },
  { metodo: 'POST', caminho: /^\/login$/,                   protegida: false, fn: processarLogin },
  { metodo: 'GET',  caminho: /^\/cadastro$/,                protegida: false, fn: telaCadastro },
  { metodo: 'POST', caminho: /^\/cadastro$/,                protegida: false, fn: processarCadastro },
  { metodo: 'GET',  caminho: /^\/recados$/,                 protegida: true,  fn: telaMural },
  { metodo: 'POST', caminho: /^\/recados$/,                 protegida: true,  fn: publicar },
  { metodo: 'POST', caminho: /^\/recados\/(\d+)\/apagar$/,  protegida: true,  fn: apagarRecado },
  { metodo: 'POST', caminho: /^\/logout$/,                  protegida: true,  fn: sair },
];

async function atender(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');

    const rota = rotas.find((r) => r.metodo === req.method && r.caminho.test(url.pathname));
    if (!rota) return responder404(res);

    const sessao = lerSessao(req);
    if (rota.protegida && !sessao) return redirecionar(res, '/login');

    const params = url.pathname.match(rota.caminho).slice(1);
    await rota.fn({ req, res, sessao, params });
  } catch (erro) {
    console.error('[erro]', erro);
    if (!res.headersSent) enviarHtml(res, 500, paginaAviso('Erro interno do servidor. Tente de novo.'));
  }
}

const CERTIFICADO = new URL('./cert.pem', import.meta.url);
const CHAVE = new URL('./chave.pem', import.meta.url);
const comHttps = existsSync(CERTIFICADO) && existsSync(CHAVE);

const servidor = comHttps
  ? criarServidorHttps({ cert: readFileSync(CERTIFICADO), key: readFileSync(CHAVE) }, atender)
  : createServer(atender);

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`A porta ${PORTA} já está em uso (outro servidor ainda aberto?).`);
    console.error('Feche o outro programa ou escolha outra porta com a variável de ambiente PORT.');
    process.exit(1);
  }
  throw erro;
});

limparSessoesVencidas();

servidor.listen(PORTA, () => {
  console.log(`Servidor no ar: ${comHttps ? 'https' : 'http'}://localhost:${servidor.address().port}`);
});
