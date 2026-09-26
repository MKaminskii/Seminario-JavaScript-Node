# Mural de Recados — servidor web sem framework

Projeto que acompanha a apresentação **"Servidor web sem framework"**. Um mural
onde qualquer pessoa cria conta, faz login, publica e apaga recados — usando
**só o que já vem instalado com o Node.js**: `node:http`, `node:sqlite` e
`node:crypto`. Nenhuma biblioteca de terceiros, nenhum `npm install`.

## Requisitos

- **Node.js 22.13 ou mais novo** (recomendado: a versão LTS atual). O módulo
  `node:sqlite` existe desde a versão 22.5, mas só funciona sem opção especial
  a partir da 22.13.
- Nada além disso. Sem `npm install`, sem banco externo, sem `.env`.

Dependendo da versão do Node, pode aparecer um aviso como este — é esperado, não é erro:

```
ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

## Como rodar

```bash
node server.js
```

(ou `npm start`). Depois abra **http://localhost:3000**. Na primeira execução,
o Node cria sozinho o arquivo `mural.db` (o banco) na pasta do projeto.

**A porta 3000 está ocupada?** O servidor avisa. Para usar outra porta:

| Terminal | Comando |
|---|---|
| macOS, Linux ou Git Bash | `PORT=3001 node server.js` |
| PowerShell (Windows) | `$env:PORT=3001; node server.js` |
| Prompt de Comando (Windows) | `set PORT=3001` e depois `node server.js` |

**Já rodou uma versão anterior deste projeto?** Apague o `mural.db` antes. O
`CREATE TABLE IF NOT EXISTS` não altera tabelas que já existem, e o banco antigo
ficaria sem as regras novas.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm test` | roda os 34 testes automáticos (uns 5 segundos, com banco temporário — o seu `mural.db` não é tocado) |
| `npm start` | o mesmo que `node server.js` |

**Rodem `npm test` no computador da apresentação antes de apresentar.** Se
passar, o projeto funciona na versão do Node instalada lá.

## Estrutura de pastas

```
mural-de-recados/
├── server.js               cria o servidor, define as rotas e o que cada uma faz
├── src/
│   ├── db.js               abre o SQLite e cria as tabelas               
│   ├── http.js             lê formulário, cookies, escapa HTML, responde 
│   ├── auth.js             hash de senha e sessões                       
│   ├── paginas.js          as telas (login, cadastro, mural) em HTML     
│   └── limites.js          limites de tamanho de nome, senha e recado
├── testes/
│   └── mural.test.js       testes automáticos com node:test (npm test)
├── package.json
└── mural.db                criado automaticamente ao rodar 
```

### Uma mensagem no console que não é erro do site

Com o DevTools aberto em `localhost`, o próprio Chrome pede um arquivo de
configuração dele: `/.well-known/appspecific/com.chrome.devtools.json`. Ele serve
para o DevTools se ligar sozinho à pasta do projeto — o nosso site não usa isso.
A CSP bloqueia esse pedido e o console mostra:

```
Refused to connect to '.../com.chrome.devtools.json' because it violates the
following Content Security Policy directive: "default-src 'none'"
```

**Nada deixa de funcionar.** É a CSP fazendo exatamente o que promete: a página
não conecta em lugar nenhum. Na apresentação dá até para usar a mensagem a favor:
"olhem, a política bloqueou até uma requisição do próprio navegador".

Se preferirem o console limpo na hora da demo, mostrem a aba **Application**
(onde fica o cookie) em vez do **Console** — ou desliguem a funcionalidade em
`chrome://flags`, procurando por **DevTools Project Settings** e marcando
*Disabled* (precisa reiniciar o Chrome).

## Segurança implementada

- **Injeção de SQL:** toda consulta usa `?`; nenhum valor é colado dentro do comando.
- **XSS:** todo texto vindo do usuário ou do banco passa por `escaparHtml` antes de virar HTML.
- **Segunda camada contra XSS:** cabeçalho `Content-Security-Policy` que proíbe scripts na página.
- **Senhas:** scrypt com sal aleatório por usuário; guardamos `sal:hash`, nunca a senha.
- **Login que não entrega usuários:** mensagem sempre igual e tempo de resposta igual.
- **Cookie de sessão:** só um número aleatório, com `HttpOnly`, `SameSite=Lax`, `Path=/` e prazo de 2 horas.
- **Sessão no servidor:** prazo conferido na tabela; "Sair" apaga a sessão do banco; sessões vencidas são limpas.
- **Token CSRF:** todo formulário de quem está logado (publicar, apagar e sair) leva um código secreto conferido pelo servidor.
- **Sem cache de página logada:** `Cache-Control: no-store`.
- **Sem iframe de outros sites:** `frame-ancestors 'none'` (contra clickjacking).
- **Dono do recado:** só quem publicou consegue apagar.
- **Limites:** corpo de até 1 MB, nome de até 30 caracteres, recado de até 500.
- **Robustez:** nenhum pedido malformado derruba o servidor.
