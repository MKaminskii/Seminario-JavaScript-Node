// server.js
//
// Parte 1 da apresentação — o servidor em si: cria o servidor HTTP, decide
// qual "página" cada pedido quer (rotas) e chama a função responsável.
//
// Para rodar:   node server.js
// Depois abra:  http://localhost:3000

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

// Porta 3000, a não ser que a variável de ambiente PORT diga outra.
const PORTA = Number(process.env.PORT ?? 3000);

// -----------------------------------------------------------------------
// Consultas usadas pelas rotas (Parte 3 · Banco)
// Todas usam "?": o valor digitado nunca é colado dentro do comando SQL.
// -----------------------------------------------------------------------

const buscarUsuarioPorNome = db.prepare('SELECT id, nome, senha FROM usuarios WHERE nome = ?');
const inserirUsuario = db.prepare('INSERT INTO usuarios (nome, senha) VALUES (?, ?)');

const listarRecados = db.prepare(`
  SELECT recados.id, recados.usuario_id, recados.texto, recados.criado_em, usuarios.nome AS autor
  FROM recados JOIN usuarios ON usuarios.id = recados.usuario_id
  ORDER BY recados.id DESC
`);
const inserirRecado = db.prepare('INSERT INTO recados (usuario_id, texto) VALUES (?, ?)');
// só apaga se o id bater E o dono for quem está pedindo — ninguém apaga recado alheio
const apagarRecadoDoDono = db.prepare('DELETE FROM recados WHERE id = ? AND usuario_id = ?');

// -----------------------------------------------------------------------
// Funções de apoio usadas pelas rotas
// -----------------------------------------------------------------------

// Abre uma sessão nova para o usuário e manda o navegador guardar o cookie.
// Se esse navegador já tinha uma sessão, ela é fechada antes: o número da
// sessão muda a cada login e nenhuma sessão velha fica sobrando no banco.
function entrar(res, usuarioId, sessaoAnterior) {
  if (sessaoAnterior) fecharSessao(sessaoAnterior.id);
  const sid = criarSessao(usuarioId);
  definirCookie(res, 'sid', sid, DURACAO_SESSAO_SEGUNDOS);
  redirecionar(res, '/recados');
}

// Todo formulário de quem está logado leva escondido o código secreto da
// sessão (campo "csrf"). Se o valor não bater, o pedido não saiu de uma
// página nossa — pode ser outro site tentando agir em nome da pessoa.
function csrfConfere(dados, sessao) {
  return dados.csrf === sessao.csrf;
}

function recusarCsrf(res) {
  enviarHtml(res, 403, paginaAviso('Formulário expirado. Volte, recarregue a página e tente de novo.'));
}

function responder404(res) {
  enviarHtml(res, 404, paginaAviso('Página não encontrada.'));
}

// -----------------------------------------------------------------------
// Handlers — uma função por rota. Cada uma recebe { req, res, sessao, params }
// -----------------------------------------------------------------------

function raiz({ res, sessao }) {
  redirecionar(res, sessao ? '/recados' : '/login');
}

function telaLogin({ res, sessao }) {
  if (sessao) return redirecionar(res, '/recados');
  enviarHtml(res, 200, paginaLogin());
}

async function processarLogin({ req, res, sessao }) {
  const dados = await lerCorpo(req);
  const nome = (dados.nome ?? '').trim(); // igual ao cadastro: "ana " entra como "ana"
  const senha = dados.senha ?? '';

  const usuario = buscarUsuarioPorNome.get(nome);

  // Mesmo quando o usuário não existe, calculamos o hash (contra um hash
  // fictício). Assim a resposta demora o mesmo tanto nos dois casos e o tempo
  // não entrega quais nomes existem — algo que a mensagem genérica já esconde.
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

  // A coluna "nome" não diferencia maiúsculas (COLLATE NOCASE em src/db.js),
  // então esta busca por "Ana" também encontra "ana". Entre a busca e o
  // INSERT não existe nenhum "await": nenhum outro pedido se mete no meio.
  if (buscarUsuarioPorNome.get(nome)) {
    return enviarHtml(res, 409, paginaCadastro({ erro: 'Esse nome de usuário já existe.' }));
  }

  // Qualquer outro erro do banco aqui (ex.: arquivo travado) sobe até o
  // try/catch lá embaixo e vira um 500 honesto, registrado no terminal.
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

  // O maxlength do formulário ajuda quem usa o site normalmente, mas qualquer
  // um pode mandar um POST sem passar pela página. Quem garante é o servidor.
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

  fecharSessao(sessao.id); // apaga a linha da tabela sessoes
  limparCookie(res, 'sid'); // manda o navegador descartar o cookie
  redirecionar(res, '/login');
}

// -----------------------------------------------------------------------
// Rotas — a "lista de páginas" (slide "Rotas: decidir o que responder para
// cada endereço"). Usamos expressões regulares para reconhecer endereços
// com um número dentro, como /recados/7/apagar.
// -----------------------------------------------------------------------

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

// A função que o Node chama a cada pedido — a mesma para HTTP e para HTTPS.
async function atender(req, res) {
  // Tudo fica dentro do try: qualquer erro, até um cookie ou endereço
  // malformado, vira uma resposta 500 só para aquele pedido, em vez de
  // derrubar o servidor inteiro para todo mundo.
  try {
    // Só precisamos do caminho (/recados...). A base é fixa de propósito:
    // o cabeçalho Host é escrito pelo cliente e pode conter qualquer coisa.
    const url = new URL(req.url, 'http://localhost');

    // 1. Achar a rota (Parte 1)
    const rota = rotas.find((r) => r.metodo === req.method && r.caminho.test(url.pathname));
    if (!rota) return responder404(res);

    // 2. Ler a sessão do cookie (Parte 4) e barrar quem não está logado
    const sessao = lerSessao(req);
    if (rota.protegida && !sessao) return redirecionar(res, '/login');

    // 3 e 4. A função da rota lê o formulário (Parte 2) e usa o banco (Parte 3)
    const params = url.pathname.match(rota.caminho).slice(1);
    await rota.fn({ req, res, sessao, params });
  } catch (erro) {
    console.error('[erro]', erro);
    if (!res.headersSent) enviarHtml(res, 500, paginaAviso('Erro interno do servidor. Tente de novo.'));
  }
}

// HTTPS é opcional: se existirem os arquivos cert.pem e chave.pem na pasta do
// projeto, o servidor sobe em https (e o cookie ganha o atributo Secure
// sozinho, ver src/http.js). Sem eles, sobe em http, como sempre.
// O README explica como gerar esses dois arquivos.
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

// Sessões que venceram enquanto o servidor estava desligado são apagadas na partida.
limparSessoesVencidas();

servidor.listen(PORTA, () => {
  console.log(`Servidor no ar: ${comHttps ? 'https' : 'http'}://localhost:${servidor.address().port}`);
});
