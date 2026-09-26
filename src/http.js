const TAMANHO_MAXIMO_CORPO = 1e6;

const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;

    req.on('data', (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > TAMANHO_MAXIMO_CORPO) {
        req.destroy();
        reject(new Error('corpo da requisição excede o limite permitido'));
        return;
      }
      pedacos.push(pedaco);
    });

    req.on('end', () => {
      const texto = Buffer.concat(pedacos).toString('utf8');
      resolve(Object.fromEntries(new URLSearchParams(texto)));
    });

    req.on('error', reject);
  });
}

function decodificar(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

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

export function definirCookie(res, nome, valor, maxIdadeSegundos) {
  const seguro = res.socket?.encrypted ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${nome}=${encodeURIComponent(valor)}; Path=/; Max-Age=${maxIdadeSegundos}; HttpOnly; SameSite=Lax${seguro}`
  );
}

export function limparCookie(res, nome) {
  definirCookie(res, nome, '', 0);
}

export function escaparHtml(texto = '') {
  return String(texto).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

export function enviarHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...CABECALHOS_SEGURANCA });
  res.end(html);
}

export function redirecionar(res, destino) {
  res.writeHead(303, { Location: destino });
  res.end();
}
