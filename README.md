# Mural de Recados — versão da apresentação

Mesmo sistema da pasta `mural-de-recados`, com o **código sem comentários**, para
projetar durante a apresentação. A versão comentada é a de estudo — use aquela
para entender cada linha.

Um mural onde a pessoa cria conta, faz login, publica e apaga recados, usando só
o que já vem com o Node.js: `node:http`, `node:sqlite` e `node:crypto`. Zero
dependências.

## Rodar

```bash
node server.js
```

Depois abra **http://localhost:3000**. O arquivo `mural.db` é criado sozinho na
primeira execução. Para usar outra porta: `PORT=3001 node server.js`
(no PowerShell: `$env:PORT=3001; node server.js`).

## Arquivos

```
server.js         cria o servidor, as rotas e o que cada rota faz   
src/http.js       formulário, cookies, escape de HTML, respostas    
src/db.js         abre o SQLite e cria as tabelas                   
src/auth.js       hash de senha e sessões                           
src/paginas.js    as telas em HTML                                  
src/limites.js    tamanhos máximos de nome, senha e recado
```