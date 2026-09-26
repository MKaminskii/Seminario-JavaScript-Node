// src/http.js
//
// pecinhas pequenas que o node:http não traz
// prontas, mas que qualquer servidor precisa: ler o corpo de um formulário,
// ler/escrever cookies, escapar texto antes dele virar HTML e responder.

const TAMANHO_MAXIMO_CORPO = 1e6; // 1 MB — sobra para um formulário, falta para um ataque

// Cabeçalhos enviados junto com toda página HTML.
const CABECALHOS_SEGURANCA = {
  // Segunda camada contra XSS: esta página não carrega nem executa nenhum
  // script. Se algum texto passasse sem o escaparHtml, o navegador ainda
  // assim se recusaria a rodá-lo. O frame-ancestors impede que outro site
  // coloque o mural dentro de um <iframe> para enganar cliques.
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  // O navegador não tenta "adivinhar" o tipo do conteúdo: HTML é HTML.
  'X-Content-Type-Options': 'nosniff',
  // Páginas com dados de quem está logado não ficam guardadas no cache.
  // Depois de "Sair", o botão Voltar não reexibe o mural antigo.
  'Cache-Control': 'no-store',
};

// Lê o corpo de uma requisição POST (application/x-www-form-urlencoded) e
// devolve um objeto, ex.: { nome: 'ana', senha: '1234' }.
//
// O corpo não chega pronto: ele vem em pedaços (evento 'data'), como um
// download. Só depois do evento 'end' sabemos que acabou de chegar e
// podemos juntar tudo.
export function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;

    req.on('data', (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > TAMANHO_MAXIMO_CORPO) {
        // Sem este limite, alguém derruba o servidor mandando um envio gigante.
        req.destroy();
        reject(new Error('corpo da requisição excede o limite permitido'));
        return;
      }
      pedacos.push(pedaco);
    });

    req.on('end', () => {
      const texto = Buffer.concat(pedacos).toString('utf8');
      // URLSearchParams já resolve "%20", "+", acentos etc. sozinho.
      resolve(Object.fromEntries(new URLSearchParams(texto)));
    });

    req.on('error', reject);
  });
}

// Quem escreve o cabeçalho Cookie é o cliente, então não dá para confiar no
// formato: um valor como "sid=%E0%A4%A" faria o decodeURIComponent lançar
// erro. Nesse caso ficamos com o texto cru, que simplesmente não vai bater
// com nenhuma sessão.
function decodificar(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

// Transforma o cabeçalho "Cookie: sid=abc; tema=escuro" em { sid: 'abc', tema: 'escuro' }.
export function lerCookies(req) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return {};

  return Object.fromEntries(
    cabecalho.split(';').map((par) => {
      const [chave, ...resto] = par.trim().split('=');
      return [chave, decodificar(resto.join('='))];
    })
  );
}

// Manda o navegador guardar um cookie. Os atributos:
//
//   Path=/        o cookie vale para o site inteiro
//   Max-Age       por quantos segundos o navegador guarda o cookie
//   HttpOnly      o JavaScript da página não consegue ler o cookie
//   SameSite=Lax  o navegador não manda o cookie em POSTs que partem de outro site
//
// O "Secure" entra sozinho quando a conexão é HTTPS (res.socket.encrypted diz
// isso). Em http:// ele ficaria de fora de propósito: com Secure, o navegador
// só guarda o cookie em https, e quem abrisse o mural pelo IP da rede não
// conseguiria ficar logado. Veja no README como subir o servidor em HTTPS.
export function definirCookie(res, nome, valor, maxIdadeSegundos) {
  const seguro = res.socket?.encrypted ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${nome}=${encodeURIComponent(valor)}; Path=/; Max-Age=${maxIdadeSegundos}; HttpOnly; SameSite=Lax${seguro}`
  );
}

// Apaga um cookie mandando Max-Age=0 — é assim que se pede ao navegador para esquecê-lo.
export function limparCookie(res, nome) {
  definirCookie(res, nome, '', 0);
}

// Troca os símbolos que têm significado especial em HTML pelo código
// equivalente, para que texto digitado pelo usuário nunca vire código.
// Sem isso, um recado com <script>...</script> executaria na tela de
// todo mundo que abrisse o mural (isso se chama XSS).
export function escaparHtml(texto = '') {
  return String(texto).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Monta e envia uma resposta HTML completa, já com os cabeçalhos de segurança.
export function enviarHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...CABECALHOS_SEGURANCA });
  res.end(html);
}

// Redireciona o navegador para outra página. O 303 é o código certo depois de
// um POST (padrão "Post/Redirect/Get"): assim, se a pessoa der F5 na página
// que chegou, o navegador repete o GET — não o POST que publicou o recado.
export function redirecionar(res, destino) {
  res.writeHead(303, { Location: destino });
  res.end();
}
